/**
 * Hacker News agent — find stories + draft HITL comments.
 * Never posts.
 */

import { completeJsonDetailed } from "../adapters/openai";
import { searchHnStories } from "../connectors/hackernews";
import {
  recallBrandMemory,
  type BrandMemoryInput,
} from "../memory/brand-memory";
import {
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
} from "../prompts/untrusted-scrape";

export type HnStory = {
  id: string;
  title: string;
  url: string;
  author: string;
  points: number;
  observed_at: string;
};

export type HnOpportunity = {
  story: HnStory;
  query: string;
  why: string;
  draft_comment: string;
  risk: "low" | "medium" | "high";
};

export type HnAgentResult = {
  ok: boolean;
  opportunities: HnOpportunity[];
  queries: string[];
  error?: string;
  note: string;
};

function brandQueries(brand: BrandMemoryInput): string[] {
  const q = [
    brand.pillars[0],
    brand.icp.split(/[,.]/)[0]?.trim(),
    brand.name,
    `${brand.pillars[0] || "SaaS"} show hn`,
  ].filter((x): x is string => Boolean(x && x.length > 2));
  return [...new Set(q)].slice(0, 4);
}

export async function runHnAgent(opts: {
  brand: BrandMemoryInput;
  ownerId: string;
  limit?: number;
}): Promise<HnAgentResult> {
  const limit = Math.min(5, Math.max(1, opts.limit ?? 3));
  const queries = brandQueries(opts.brand);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      opportunities: [],
      queries,
      error:
        "OPENAI_API_KEY required for HN drafts. We refuse template comments.",
      note: "Configure a live model — agent never enqueues offline slop.",
    };
  }

  const searches = await Promise.all(
    queries.map(async (query) => {
      const r = await searchHnStories(query, 8);
      return { query, r };
    }),
  );

  const byId = new Map<string, { story: HnStory; query: string }>();
  for (const { query, r } of searches) {
    for (const item of r.items) {
      const id = item.external_id;
      const story: HnStory = {
        id,
        title: item.title,
        url: item.url || `https://news.ycombinator.com/item?id=${id}`,
        author: item.author || "unknown",
        points: Number(item.metrics?.hn_points ?? item.metrics?.engagement ?? 0),
        observed_at: item.observed_at,
      };
      const prev = byId.get(id);
      if (!prev || story.points > prev.story.points) {
        byId.set(id, { story, query });
      }
    }
  }

  const ranked = [...byId.values()]
    .sort((a, b) => b.story.points - a.story.points)
    .slice(0, limit);

  if (!ranked.length) {
    return {
      ok: false,
      opportunities: [],
      queries,
      error: searches.find((s) => !s.r.ok)?.r.error || "No HN stories found",
      note: "Try broader pillars or retry. Never auto-posts.",
    };
  }

  const recall = await recallBrandMemory({
    brandName: opts.brand.name,
    ownerId: opts.ownerId,
    brand: opts.brand,
    task: "draft_reddit",
  });

  const opportunities: HnOpportunity[] = [];
  let draftFailures = 0;
  for (const { story, query } of ranked) {
    const draft = await draftHnComment({
      brand: opts.brand,
      story,
      contextLines: recall.contextLines,
    });
    if (!draft.ok) {
      draftFailures += 1;
      continue;
    }
    opportunities.push({
      story,
      query,
      why: draft.why,
      draft_comment: draft.body,
      risk: draft.risk,
    });
  }

  if (opportunities.length === 0) {
    return {
      ok: false,
      opportunities: [],
      queries,
      error:
        draftFailures > 0
          ? "Live model failed to draft HN comments."
          : "No drafts produced.",
      note: "Fail closed — no template comments.",
    };
  }

  return {
    ok: true,
    opportunities,
    queries,
    note: `${opportunities.length} HN comment drafts for HITL — nothing posted.`,
  };
}

async function draftHnComment(opts: {
  brand: BrandMemoryInput;
  story: HnStory;
  contextLines: string[];
}): Promise<
  | { ok: true; body: string; why: string; risk: "low" | "medium" | "high" }
  | { ok: false; error: string }
> {
  const { brand, story, contextLines } = opts;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "OPENAI_API_KEY unset" };
  }

  const schema = `{
  "body": string,
  "why": string,
  "risk": "low"|"medium"|"high"
}`;

  const user = `${wrapUntrustedScrapedData(
    `HN: ${story.title}\nby ${story.author} · ${story.points} points\n${story.url}`,
  )}

Brand memory:
${contextLines.join("\n") || `${brand.name}: ${brand.oneliner}`}

Draft ONE Hacker News comment:
- Technical / thoughtful; no hard sell
- Mention ${brand.name} only if naturally relevant
- Max ~120 words
- No fake claims`;

  const parsed = await completeJsonDetailed(user, schema, {
    system: `${UNTRUSTED_SCRAPE_SYSTEM}\nHN comment drafts for HITL only.`,
  });

  if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") {
    return {
      ok: false,
      error: parsed.ok === false ? parsed.error || "model failed" : "empty model",
    };
  }
  const o = parsed.data as Record<string, unknown>;
  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (!body) return { ok: false, error: "model returned empty body" };
  return {
    ok: true,
    body,
    why: typeof o.why === "string" ? o.why : "Relevant HN discussion",
    risk:
      o.risk === "low" || o.risk === "medium" || o.risk === "high"
        ? o.risk
        : "medium",
  };
}
