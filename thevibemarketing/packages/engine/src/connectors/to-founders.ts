import type { Claim, Founder, Product, Signal } from "../types";
import type { NormalizedIngestItem } from "./types";

export type IngestDraft = {
  founder: Omit<
    Founder,
    "founder_score" | "score_confidence" | "gravity" | "created_at" | "updated_at"
  > & {
    founder_score?: number;
    score_confidence?: number;
  };
  product: Product;
  signals: Array<Omit<Signal, "id" | "ingested_at"> & { id?: string }>;
  curated?: boolean;
};

function slug(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
}

function domainFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (
      /github\.com|news\.ycombinator\.com|producthunt\.com|arxiv\.org|ycombinator\.com|techstars\.com|joinef\.com/i.test(
        host,
      )
    ) {
      return undefined;
    }
    return host;
  } catch {
    return undefined;
  }
}

function tractionFromMetrics(item: NormalizedIngestItem): Claim[] {
  const claims: Claim[] = [];
  if ((item.metrics.stars ?? 0) > 0) {
    claims.push({
      text: `${item.metrics.stars} GitHub stars on ${item.title}`,
      category: "traction",
      evidence_url: item.url,
      confidence: 0.7,
      contradiction: false,
    });
  }
  if ((item.metrics.hn_points ?? 0) > 0) {
    claims.push({
      text: `Show HN ${item.metrics.hn_points} points — ${item.title}`,
      category: "traction",
      evidence_url: item.url,
      confidence: 0.65,
      contradiction: false,
    });
  }
  if ((item.metrics.upvotes ?? 0) > 0) {
    claims.push({
      text: `${item.metrics.upvotes} Product Hunt upvotes — ${item.title}`,
      category: "traction",
      evidence_url: item.url,
      confidence: 0.6,
      contradiction: false,
    });
  }
  if ((item.metrics.papers ?? 0) > 0) {
    claims.push({
      text: `arXiv paper — ${item.title}`,
      category: "traction",
      evidence_url: item.url,
      confidence: 0.55,
      contradiction: false,
    });
  }
  if ((item.metrics.accelerator ?? 0) > 0) {
    claims.push({
      text: `Accelerator cohort signal — ${item.title}`,
      category: "track_record",
      evidence_url: item.url,
      confidence: 0.5,
      contradiction: false,
    });
  }
  if ((item.metrics.hackathon ?? 0) > 0) {
    claims.push({
      text: `Hackathon win / finalist — ${item.title}`,
      category: "track_record",
      evidence_url: item.url,
      confidence: 0.55,
      contradiction: false,
    });
  }
  return claims;
}

/**
 * Group normalized ingest items by source:author to avoid GH/HN username collisions.
 */
export function itemsToFounderDrafts(items: NormalizedIngestItem[]): IngestDraft[] {
  const byKey = new Map<string, NormalizedIngestItem[]>();
  for (const item of items) {
    const author = (item.author || "unknown").toLowerCase();
    const key = `${item.source}:${author}`;
    const list = byKey.get(key) ?? [];
    list.push(item);
    byKey.set(key, list);
  }

  const drafts: IngestDraft[] = [];
  const now = new Date().toISOString();

  for (const [key, group] of byKey) {
    const [source, authorRaw] = key.split(":");
    const author = authorRaw || "unknown";
    const id = `live_${slug(`${source}_${author}`)}`;
    const top = [...group].sort((a, b) => {
      const sa =
        (a.metrics.stars ?? 0) +
        (a.metrics.hn_points ?? 0) * 2 +
        (a.metrics.upvotes ?? 0) +
        (a.metrics.papers ?? 0) +
        (a.metrics.cohort_score ?? 0);
      const sb =
        (b.metrics.stars ?? 0) +
        (b.metrics.hn_points ?? 0) * 2 +
        (b.metrics.upvotes ?? 0) +
        (b.metrics.papers ?? 0) +
        (b.metrics.cohort_score ?? 0);
      return sb - sa;
    })[0]!;

    const links = [...new Set(group.map((g) => g.url))];
    const handles: Founder["handles"] = {};
    if (source === "github") handles.github = author;
    if (source === "hackernews") handles.hn = author;

    const traction = group.flatMap(tractionFromMetrics);
    const curated =
      source === "producthunt" ||
      source === "accelerator" ||
      source === "hackathon";

    const homepage =
      typeof (top.raw as { homepage?: string } | undefined)?.homepage === "string"
        ? (top.raw as { homepage: string }).homepage
        : undefined;
    const domain = domainFromUrl(homepage) || domainFromUrl(top.url);

    const displayName =
      source === "accelerator" ||
      source === "arxiv" ||
      source === "hackathon"
        ? top.author
        : author;

    const productName =
      source === "github"
        ? top.title.split("/")[1] || top.title
        : source === "accelerator"
          ? String((top.raw as { company?: string })?.company || top.title).slice(
              0,
              80,
            )
          : source === "hackathon"
            ? String(
                (top.raw as { project?: string })?.project || top.title,
              ).slice(0, 80)
            : top.title.replace(/^Show HN:\s*/i, "").slice(0, 80);

    const founder = {
      id,
      name: displayName,
      handles,
      links: homepage ? [...links, homepage] : links,
      bio: `Live-ingested from ${source} — ${top.title}`,
      claims: traction.slice(0, 3),
    };

    const product: Product = {
      id: `p_${id}`,
      founder_id: id,
      name: productName.slice(0, 80),
      domain,
      oneliner: top.title,
      sector: "developer tools",
      stage: "pre-seed",
      traction_claims: traction.slice(0, 3),
    };

    const signals = group.map((g) => ({
      entity_type: "founder" as const,
      entity_id: id,
      source: g.source,
      url: g.url,
      payload: { ...g.metrics, title: g.title, curated },
      observed_at: g.observed_at || now,
    }));

    drafts.push({ founder, product, signals, curated });
  }

  return drafts;
}
