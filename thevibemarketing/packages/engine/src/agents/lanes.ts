/**
 * Multi-agent enrichment lanes — each role uses a scoped set of API endpoints.
 * Coordinator (host) fans out in parallel; Memory/traces are the shared bus.
 *
 * Role → providers (important endpoints only):
 * - code_forensics: GitHub commits/readme/languages + E2B git clone/log
 * - web_research:   Tavily /search + Firecrawl /scrape (markdown)
 * - claim_validator: Tavily /search per material claim
 * - hn_scout:       HN Algolia search
 * - memory_writer:  Supermemory v4 memories + search
 */

import {
  fetchRepoCommits,
  fetchRepoLanguages,
  fetchRepoReadme,
  fetchUserPublicRepos,
  parseGithubInput,
} from "../connectors/github";
import {
  e2bCodeForensics,
  e2bHealth,
  parseE2BForensicsStdout,
} from "../connectors/e2b";
import { scrapeMarkdown } from "../connectors/firecrawl";
import { tavilySearch } from "../connectors/tavily";
import { searchHnStories } from "../connectors/hackernews";
import {
  addMemories,
  founderContainerTag,
  isSupermemoryConfigured,
  searchMemories,
} from "../connectors/supermemory";
import type { Claim, Founder, Product } from "../types";

export type AgentLaneResult = {
  role:
    | "code_forensics"
    | "web_research"
    | "claim_validator"
    | "hn_scout"
    | "memory_writer";
  ok: boolean;
  providers: string[];
  sandbox_id?: string;
  evidence: string[];
  /** Extra signals to merge into Memory (optional). */
  signal_payloads?: Array<{
    source: string;
    url?: string;
    payload: Record<string, unknown>;
  }>;
  error?: string;
  latency_ms: number;
};

export type AgentFleetResult = {
  lanes: AgentLaneResult[];
  ok_count: number;
  providers_used: string[];
  total_latency_ms: number;
};

function resolveGithubRepo(
  founder: Founder,
  product?: Product | null,
): { owner: string; repo: string } | null {
  const handle = founder.handles.github?.trim();
  if (handle) {
    const parsed = parseGithubInput(
      handle.includes("/") ? handle : `${handle}`,
    );
    if (parsed?.repo) return { owner: parsed.owner, repo: parsed.repo };
  }
  for (const link of founder.links ?? []) {
    const parsed = parseGithubInput(link);
    if (parsed?.repo) return { owner: parsed.owner, repo: parsed.repo };
  }
  if (product?.domain && /github\.com/i.test(product.domain)) {
    const parsed = parseGithubInput(product.domain);
    if (parsed?.repo) return { owner: parsed.owner, repo: parsed.repo };
  }
  return null;
}

/** GitHub REST deep dive + optional E2B shell forensics. */
export async function runCodeForensicsLane(
  founder: Founder,
  product?: Product | null,
): Promise<AgentLaneResult> {
  const t0 = Date.now();
  const providers: string[] = [];
  const evidence: string[] = [];
  const signal_payloads: AgentLaneResult["signal_payloads"] = [];

  let repo = resolveGithubRepo(founder, product);
  const owner = repo?.owner || founder.handles.github?.replace(/^@/, "");
  if (!owner) {
    return {
      role: "code_forensics",
      ok: false,
      providers: [],
      evidence: [],
      error: "No GitHub handle/repo on founder",
      latency_ms: Date.now() - t0,
    };
  }

  // Owner only: pull followers + public repos for gravity; promote top repo for clone.
  if (!repo?.repo) {
    providers.push("github");
    const userPack = await fetchUserPublicRepos(owner, { limit: 6 });
    if (!userPack.ok || !userPack.user) {
      return {
        role: "code_forensics",
        ok: false,
        providers,
        evidence: [
          `GitHub user @${owner} — profile fetch failed: ${userPack.error ?? "unknown"}`,
        ],
        error: userPack.error ?? "GitHub user fetch failed",
        latency_ms: Date.now() - t0,
      };
    }
    evidence.push(
      `GitHub @${userPack.user.login}: ${userPack.user.followers} followers · ${userPack.items.length} public repos`,
    );
    signal_payloads.push({
      source: "github",
      url: userPack.user.html_url ?? `https://github.com/${owner}`,
      payload: {
        followers: userPack.user.followers,
        audience: userPack.user.followers,
        post_count: Math.max(1, userPack.items.length),
        shipping_events: userPack.items.length,
        engagement:
          userPack.user.followers +
          userPack.items.reduce((n, i) => n + (i.metrics?.stars ?? 0), 0),
      },
    });
    const top = [...userPack.items].sort(
      (a, b) => (b.metrics?.stars ?? 0) - (a.metrics?.stars ?? 0),
    )[0];
    if (top?.title?.includes("/")) {
      const [o, r] = top.title.split("/");
      if (o && r) {
        repo = { owner: o, repo: r };
        signal_payloads.push({
          source: "github",
          url: top.url,
          payload: {
            stars: top.metrics?.stars ?? 0,
            forks: top.metrics?.forks ?? 0,
            engagement: (top.metrics?.stars ?? 0) + (top.metrics?.forks ?? 0),
            title: top.title,
          },
        });
        evidence.push(`Top repo ${top.title}: ⭐${top.metrics?.stars ?? 0}`);
      }
    }
    if (!repo?.repo) {
      return {
        role: "code_forensics",
        ok: true,
        providers,
        evidence,
        signal_payloads,
        latency_ms: Date.now() - t0,
      };
    }
  }

  const full = `${repo.owner}/${repo.repo}`;
  providers.push("github");
  const [commits, readme, languages] = await Promise.all([
    fetchRepoCommits(repo.owner, repo.repo, 15),
    fetchRepoReadme(repo.owner, repo.repo),
    fetchRepoLanguages(repo.owner, repo.repo),
  ]);

  if (commits.ok) {
    evidence.push(
      `${full}: ${commits.commits.length} recent commits via GET /repos/.../commits`,
    );
    for (const c of commits.commits.slice(0, 5)) {
      evidence.push(`commit ${c.sha}: ${c.message}`);
    }
    signal_payloads.push({
      source: "github_commits",
      url: `https://github.com/${full}/commits`,
      payload: {
        commit_count: commits.commits.length,
        latest: commits.commits[0]?.message,
        dates: commits.commits.map((c) => c.date).filter(Boolean),
      },
    });
  } else if (commits.error) {
    evidence.push(`commits: ${commits.error}`);
  }

  if (readme.ok && readme.markdown) {
    const claimish = readme.markdown.match(
      /\b(\d{1,3}(?:,\d{3})*|\d+)k?\s+(users|stars|downloads|customers)\b/i,
    );
    evidence.push(
      `README ${readme.html_url ?? full} (${readme.markdown.length} chars)`,
    );
    if (claimish) {
      evidence.push(`README claim-like phrase: "${claimish[0]}"`);
    }
    signal_payloads.push({
      source: "github_readme",
      url: readme.html_url,
      payload: { excerpt: readme.markdown.slice(0, 1500) },
    });
  }

  if (languages.ok) {
    const top = Object.entries(languages.languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}:${v}`);
    if (top.length) {
      evidence.push(`languages: ${top.join(", ")}`);
      providers.push("github_languages");
    }
  }

  // E2B sandbox lane — only when Team key healthy.
  const health = await e2bHealth();
  let sandbox_id: string | undefined;
  if (health.ok) {
    providers.push("e2b");
    const sbx = await e2bCodeForensics(full);
    sandbox_id = sbx.sandboxId;
    if (sbx.ok || sbx.stdout) {
      evidence.push(
        `E2B sandbox ${sbx.sandboxId ?? "?"} (${sbx.latency_ms}ms)`,
      );
      const parsed = parseE2BForensicsStdout(sbx.stdout);
      evidence.push(
        `e2b commits=${parsed.commit_count}` +
          (parsed.last_commit_iso
            ? ` last=${parsed.last_commit_iso}`
            : "") +
          (parsed.has_tests ? " tests=yes" : " tests=no"),
      );
      const lines = sbx.stdout.split("\n").filter(Boolean).slice(0, 20);
      evidence.push(...lines.map((l) => `e2b: ${l}`));
      signal_payloads.push({
        source: "e2b_code_forensics",
        url: `https://github.com/${full}`,
        payload: {
          sandbox_id: sbx.sandboxId,
          exit_code: sbx.exitCode,
          stdout_excerpt: sbx.stdout.slice(0, 3000),
          ...parsed,
          // gravity aliases
          commits_public: parsed.commits_public,
          shipping_events: parsed.shipping_events,
        },
      });
    } else {
      evidence.push(`E2B: ${sbx.error ?? "failed"}`);
    }
  } else {
    evidence.push(`E2B skipped: ${health.error ?? "not ready"}`);
  }

  return {
    role: "code_forensics",
    ok: commits.ok || Boolean(readme.ok) || Boolean(sandbox_id),
    providers: [...new Set(providers)],
    sandbox_id,
    evidence,
    signal_payloads,
    latency_ms: Date.now() - t0,
  };
}

/** Tavily search + Firecrawl markdown scrape of top hit. */
export async function runWebResearchLane(
  founder: Founder,
  product?: Product | null,
): Promise<AgentLaneResult> {
  const t0 = Date.now();
  const providers: string[] = [];
  const evidence: string[] = [];
  const signal_payloads: AgentLaneResult["signal_payloads"] = [];

  const q = [
    founder.name,
    product?.name,
    product?.oneliner?.slice(0, 80),
    "founder",
  ]
    .filter(Boolean)
    .join(" ");

  const search = await tavilySearch(q, { maxResults: 5, searchDepth: "basic" });
  if (!search.ok) {
    return {
      role: "web_research",
      ok: false,
      providers: ["tavily"],
      evidence: [],
      error: search.error ?? "Tavily failed",
      latency_ms: Date.now() - t0,
    };
  }
  providers.push("tavily");
  if (search.answer) evidence.push(`Tavily answer: ${search.answer.slice(0, 280)}`);
  for (const hit of search.results.slice(0, 4)) {
    evidence.push(`${hit.title} — ${hit.url}`);
  }

  const top = search.results[0];
  if (top?.url) {
    const md = await scrapeMarkdown(top.url);
    if (md) {
      providers.push("firecrawl");
      evidence.push(
        `Firecrawl scrape ${top.url} (${md.length} chars markdown)`,
      );
      signal_payloads.push({
        source: "firecrawl_scrape",
        url: top.url,
        payload: { excerpt: md.slice(0, 2000), title: top.title },
      });
    } else {
      evidence.push("Firecrawl scrape skipped/failed on top hit");
    }
  }

  return {
    role: "web_research",
    ok: search.results.length > 0,
    providers,
    evidence,
    signal_payloads,
    latency_ms: Date.now() - t0,
  };
}

/** Re-check material claims via Tavily (Validator stretch goal). */
export async function runClaimValidatorLane(
  claims: Claim[],
): Promise<AgentLaneResult> {
  const t0 = Date.now();
  const evidence: string[] = [];
  const material = claims
    .filter((c) => /\d/.test(c.text) || c.contradiction)
    .slice(0, 3);

  if (material.length === 0) {
    return {
      role: "claim_validator",
      ok: true,
      providers: [],
      evidence: ["No numeric/contradiction claims to re-fetch"],
      latency_ms: Date.now() - t0,
    };
  }

  const providers = ["tavily"];
  for (const claim of material) {
    const r = await tavilySearch(`"${claim.text.slice(0, 80)}"`, {
      maxResults: 3,
      searchDepth: "basic",
    });
    if (!r.ok) {
      evidence.push(`Validator: Tavily miss for "${claim.text.slice(0, 60)}"`);
      continue;
    }
    const urls = r.results.map((x) => x.url).slice(0, 2);
    evidence.push(
      `Validator re-fetch "${claim.text.slice(0, 60)}…" → ${urls.length} hits${
        urls[0] ? ` (${urls[0]})` : ""
      }`,
    );
    if (claim.contradiction) {
      evidence.push(
        `Contradiction still flagged: ${claim.contradiction_note ?? claim.text}`,
      );
    }
  }

  return {
    role: "claim_validator",
    ok: true,
    providers,
    evidence,
    latency_ms: Date.now() - t0,
  };
}

/** HN Algolia — free, no key. */
export async function runHnScoutLane(
  founder: Founder,
  product?: Product | null,
): Promise<AgentLaneResult> {
  const t0 = Date.now();
  const q = product?.name || founder.name;
  try {
    const result = await searchHnStories(q, 5);
    const hits = result.items ?? [];
    const evidence = hits.slice(0, 5).map(
      (h) =>
        `HN: ${h.title} (${h.metrics?.hn_points ?? 0} pts) ${h.url ?? ""}`,
    );
    return {
      role: "hn_scout",
      ok: result.ok && hits.length > 0,
      providers: ["hackernews_algolia"],
      evidence:
        evidence.length > 0
          ? evidence
          : [`No HN hits for "${q}"${result.error ? ` (${result.error})` : ""}`],
      signal_payloads: hits.slice(0, 3).map((h) => ({
        source: "hackernews",
        url: h.url,
        payload: {
          title: h.title,
          hn_points: h.metrics?.hn_points ?? 0,
        },
      })),
      latency_ms: Date.now() - t0,
      error: result.ok ? undefined : result.error,
    };
  } catch (e) {
    return {
      role: "hn_scout",
      ok: false,
      providers: ["hackernews_algolia"],
      evidence: [],
      error: e instanceof Error ? e.message : "HN failed",
      latency_ms: Date.now() - t0,
    };
  }
}

/** Supermemory v4 — persist + recall founder facts. */
export async function runMemoryWriterLane(
  founder: Founder,
): Promise<AgentLaneResult> {
  const t0 = Date.now();
  if (!isSupermemoryConfigured()) {
    return {
      role: "memory_writer",
      ok: false,
      providers: ["supermemory"],
      evidence: [],
      error: "SUPERMEMORY_API_KEY unset",
      latency_ms: Date.now() - t0,
    };
  }

  const tag = founderContainerTag(founder.id);
  const facts = [
    `Founder ${founder.name} id=${founder.id} score=${founder.founder_score.toFixed(1)} conf=${founder.score_confidence.toFixed(2)}`,
    founder.bio ? `Bio: ${founder.bio.slice(0, 400)}` : "",
    founder.handles.github ? `GitHub: ${founder.handles.github}` : "",
  ].filter(Boolean);

  const added = await addMemories({
    contents: facts,
    containerTag: tag,
    metadata: { founder_id: founder.id, kind: "founder_score" },
    isStatic: false,
  });

  const recalled = await searchMemories({
    q: founder.name,
    containerTag: tag,
    limit: 5,
  });

  const evidence = [
    added.ok
      ? `Supermemory v4/memories wrote ${facts.length} facts → ${tag}`
      : `Supermemory write: ${added.error ?? "fail"}`,
    recalled.ok
      ? `Supermemory v4/search hits=${recalled.hits.length}`
      : `Supermemory search: ${recalled.error ?? "fail"}`,
    ...recalled.hits.slice(0, 3).map((h) => `memory: ${h.text.slice(0, 120)}`),
  ];

  return {
    role: "memory_writer",
    ok: added.ok || recalled.ok,
    providers: ["supermemory"],
    evidence,
    latency_ms: Date.now() - t0,
  };
}

/** Fan-out all lanes in parallel (host coordinator). */
export async function runAgentLanes(opts: {
  founder: Founder;
  product?: Product | null;
  claims?: Claim[];
}): Promise<AgentFleetResult> {
  const t0 = Date.now();
  const claims = opts.claims ?? opts.founder.claims ?? [];

  const lanes = await Promise.all([
    runCodeForensicsLane(opts.founder, opts.product),
    runWebResearchLane(opts.founder, opts.product),
    runClaimValidatorLane(claims),
    runHnScoutLane(opts.founder, opts.product),
    runMemoryWriterLane(opts.founder),
  ]);

  const providers_used = [
    ...new Set(lanes.flatMap((l) => l.providers)),
  ];

  return {
    lanes,
    ok_count: lanes.filter((l) => l.ok).length,
    providers_used,
    total_latency_ms: Date.now() - t0,
  };
}

/** Catalog of endpoints each key actually exercises — for judges / ops. */
export const AGENT_ENDPOINT_CATALOG = [
  {
    key: "E2B_API_KEY",
    role: "code_forensics",
    endpoints: [
      "GET /v2/sandboxes (health)",
      "SDK Sandbox.create",
      "SDK commands.run (git clone + log)",
      "SDK sandbox.kill",
    ],
  },
  {
    key: "GITHUB_TOKEN",
    role: "code_forensics / scout",
    endpoints: [
      "GET /users/{owner}",
      "GET /repos/{owner}/{repo}",
      "GET /repos/{owner}/{repo}/commits",
      "GET /repos/{owner}/{repo}/readme",
      "GET /repos/{owner}/{repo}/languages",
      "GET /search/repositories",
    ],
  },
  {
    key: "TAVILY_API_KEY",
    role: "web_research / claim_validator / deep_research",
    endpoints: ["POST https://api.tavily.com/search"],
  },
  {
    key: "FIRECRAWL_API_KEY",
    role: "web_research / diligence / deep_research",
    endpoints: [
      "POST /v2/map",
      "POST /v2/scrape (markdown)",
      "POST /v2/search",
    ],
  },
  {
    key: "OPENAI_API_KEY",
    role: "deep_research_synthesize (cite-only) / memo polish",
    endpoints: ["POST /v1/chat/completions (JSON, no invented facts)"],
  },
  {
    key: "SUPERMEMORY_API_KEY",
    role: "memory_writer",
    endpoints: [
      "POST /v4/memories",
      "POST /v4/search",
      "POST /v4/profile",
      "POST /v3/documents",
    ],
  },
  {
    key: "COMPOSIO_API_KEY",
    role: "activate / publish",
    endpoints: [
      "GET /v3/toolkits",
      "POST /v3/connected_accounts/link",
      "POST tool execute (HITL)",
    ],
  },
  {
    key: "OPENAI_API_KEY",
    role: "memo polish / untrusted extract",
    endpoints: ["POST /v1/chat/completions (language only — not scoring)"],
  },
  {
    key: "(none)",
    role: "hn_scout",
    endpoints: ["GET hn.algolia.com/api/v1/search"],
  },
] as const;
