import { NextResponse } from "next/server";
import {
  fetchUserPublicRepos,
  parseGithubInput,
  scoreGravity,
  type Signal,
} from "@vibe/engine";

export const runtime = "nodejs";

type AuditBody = { input?: string };

function signalsFromGithub(
  items: Array<{
    external_id: string;
    url?: string;
    observed_at: string;
    metrics?: { stars?: number; forks?: number };
    author?: string;
  }>,
  followers: number,
): Signal[] {
  const now = new Date().toISOString();
  return items.map((item, index) => ({
    id: `gh-audit-${item.external_id || index}`,
    entity_type: "founder" as const,
    entity_id: "audit",
    source: "github",
    url: item.url,
    payload: {
      stars: item.metrics?.stars ?? 0,
      forks: item.metrics?.forks ?? 0,
      followers,
      engagement: (item.metrics?.stars ?? 0) + (item.metrics?.forks ?? 0),
      shipping_events: 1,
      author: item.author,
    },
    observed_at: item.observed_at || now,
    ingested_at: now,
  }));
}

export async function POST(req: Request) {
  let body: AuditBody;
  try {
    body = (await req.json()) as AuditBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  const target = parseGithubInput(input);
  if (!target) {
    return NextResponse.json(
      {
        error: "Enter an exact GitHub username, owner/repo, or GitHub URL.",
        hint: "This audit only scores metrics fetched live from GitHub; manual and free-text metrics are not accepted.",
      },
      { status: 400 },
    );
  }

  const fetched = await fetchUserPublicRepos(target.owner, {
    repo: target.repo,
    limit: 12,
  });
  if (!fetched.ok || !fetched.user) {
    const retryable = fetched.status === 401 || fetched.status === 403 || !fetched.status;
    return NextResponse.json(
      {
        error: fetched.error ?? "GitHub could not verify this target.",
        hint: retryable
          ? "GitHub is unavailable or rate-limited. Retry after it recovers."
          : "Check that the GitHub username or repository exists and is public.",
      },
      { status: retryable ? 502 : 404 },
    );
  }

  const signals = signalsFromGithub(fetched.items, fetched.user.followers);
  const stars = signals.reduce((total, item) => total + Number(item.payload?.stars ?? 0), 0);
  const forks = signals.reduce((total, item) => total + Number(item.payload?.forks ?? 0), 0);
  // GitHub-only free tool — no HN surface here; hn_points required by GravityInputs.
  const gravity = scoreGravity({
    stars,
    forks,
    hn_points: 0,
    followers: fetched.user.followers,
    engagement: stars + forks,
    post_count: signals.length,
    shipping_events: signals.length > 0 ? 1 : 0,
    window_months: 3,
    evidence: [
      `github:${fetched.user.login}${target.repo ? `/${target.repo}` : ""}`,
      ...fetched.items.slice(0, 5).map((item) => item.url ?? item.title),
    ],
  });

  return NextResponse.json({
    ok: true,
    disclaimer:
      "Not investment advice. This score uses only metrics fetched live from the public GitHub API.",
    source: "github_live",
    resolved: {
      owner: fetched.user.login,
      profile_url: fetched.user.html_url ?? null,
      repo: target.repo ?? null,
      followers: fetched.user.followers,
      repos_scored: fetched.items.length,
      repos: fetched.items.slice(0, 5).map((repo) => ({
        name: repo.title,
        stars: repo.metrics?.stars ?? 0,
        forks: repo.metrics?.forks ?? 0,
        url: repo.url,
      })),
    },
    enrichment: {
      github_token: Boolean(process.env.GITHUB_TOKEN?.trim()),
      steps: [
        `github:verified ${fetched.user.login}`,
        `github:scored ${fetched.items.length} live public repositories`,
      ],
    },
    gravity_score: gravity.gravity_score,
    confidence: gravity.confidence,
    abstain: Boolean(gravity.abstain),
    abstain_reason: gravity.abstain_reason ?? null,
    components: gravity.components,
    evidence: gravity.evidence,
  });
}
