/**
 * Reddit marketing agent — find opportunities + draft HITL replies.
 * Never posts. Never claims published.
 */

import { completeJsonDetailed } from "../adapters/openai";
import {
  redditQueriesFromBrand,
  searchRedditThreads,
  type RedditThread,
} from "../connectors/reddit";
import {
  recallBrandMemory,
  type BrandMemoryInput,
} from "../memory/brand-memory";
import {
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
} from "../prompts/untrusted-scrape";

export type RedditOpportunity = {
  thread: RedditThread;
  query: string;
  why: string;
  draft_reply: string;
  risk: "low" | "medium" | "high";
};

export type RedditAgentResult = {
  ok: boolean;
  opportunities: RedditOpportunity[];
  queries: string[];
  error?: string;
  note: string;
};

function scoreThread(t: RedditThread): number {
  // Prefer discussion-heavy, recent enough, not dead
  const ageDays =
    t.created_utc > 0
      ? (Date.now() / 1000 - t.created_utc) / 86400
      : 30;
  const recency = ageDays < 2 ? 1.4 : ageDays < 7 ? 1.1 : 0.7;
  return (t.num_comments * 2 + t.score) * recency;
}

/**
 * Search Reddit for brand-relevant threads and draft helpful replies.
 * All replies are for HITL only.
 */
export async function runRedditAgent(opts: {
  brand: BrandMemoryInput;
  ownerId: string;
  limit?: number;
  /** Extra free-text queries */
  extraQueries?: string[];
}): Promise<RedditAgentResult> {
  const limit = Math.min(6, Math.max(1, opts.limit ?? 4));
  const queries = [
    ...redditQueriesFromBrand(opts.brand),
    ...(opts.extraQueries ?? []),
  ].slice(0, 5);

  // Fail closed before network work — no template drafts without a live model.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      opportunities: [],
      queries,
      error:
        "OPENAI_API_KEY required for Reddit drafts. We refuse template replies.",
      note: "Configure a live model — agent never enqueues offline slop.",
    };
  }

  const searches = await Promise.all(
    queries.map(async (query) => {
      const r = await searchRedditThreads({
        query,
        limit: 8,
        sort: "relevance",
        time: "week",
      });
      return { query, r };
    }),
  );

  const failed = searches.filter((s) => !s.r.ok);
  const byId = new Map<string, { thread: RedditThread; query: string }>();
  for (const { query, r } of searches) {
    for (const t of r.threads) {
      const prev = byId.get(t.id);
      if (!prev || scoreThread(t) > scoreThread(prev.thread)) {
        byId.set(t.id, { thread: t, query });
      }
    }
  }

  const ranked = [...byId.values()]
    .sort((a, b) => scoreThread(b.thread) - scoreThread(a.thread))
    .slice(0, limit);

  if (ranked.length === 0) {
    return {
      ok: false,
      opportunities: [],
      queries,
      error:
        failed[0]?.r.error ||
        "No Reddit threads found for brand queries (or Reddit rate-limited).",
      note: "Try broader pillars/ICP or retry later. Agent never auto-posts.",
    };
  }

  const recall = await recallBrandMemory({
    brandName: opts.brand.name,
    ownerId: opts.ownerId,
    brand: opts.brand,
    task: "draft_reddit",
  });

  const opportunities: RedditOpportunity[] = [];
  let draftFailures = 0;

  for (const { thread, query } of ranked) {
    const draft = await draftRedditReply({
      brand: opts.brand,
      thread,
      contextLines: recall.contextLines,
    });
    if (!draft.ok) {
      draftFailures += 1;
      continue;
    }
    opportunities.push({
      thread,
      query,
      why: draft.why,
      draft_reply: draft.body,
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
          ? "Live model failed to draft replies for found threads."
          : "No drafts produced.",
      note: "Fail closed — no template replies. Retry or check OpenAI quota.",
    };
  }

  return {
    ok: true,
    opportunities,
    queries,
    note: `Found ${opportunities.length} opportunities. All drafts pending HITL — nothing posted.`,
  };
}

async function draftRedditReply(opts: {
  brand: BrandMemoryInput;
  thread: RedditThread;
  contextLines: string[];
}): Promise<
  | { ok: true; body: string; why: string; risk: "low" | "medium" | "high" }
  | { ok: false; error: string }
> {
  const { brand, thread, contextLines } = opts;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "OPENAI_API_KEY unset" };
  }

  const untrusted = wrapUntrustedScrapedData(
    [
      `Title: ${thread.title}`,
      `r/${thread.subreddit} · score ${thread.score} · ${thread.num_comments} comments`,
      `Author: ${thread.author}`,
      `URL: ${thread.permalink}`,
      `Body: ${thread.selftext || "(link/post — no selftext)"}`,
    ].join("\n"),
  );

  const brandBlock = contextLines.length
    ? contextLines.join("\n")
    : `${brand.name}: ${brand.oneliner}\nICP: ${brand.icp}\nTone: ${brand.tone}`;

  const schema = `{
  "body": string,
  "why": string,
  "risk": "low"|"medium"|"high",
  "should_mention_product": boolean
}`;

  const user = `${untrusted}

Brand context (trusted structured memory):
${brandBlock}

Write ONE Reddit reply as a helpful community member.
Rules:
- Lead with value for the OP; no hard sell
- Only mention ${brand.name} if truly relevant (should_mention_product)
- Match brand tone; no fake metrics or customers
- Max ~180 words; plain text, no markdown headers
- risk=high if self-promo-y or off-topic`;

  const parsed = await completeJsonDetailed(user, schema, {
    system: `${UNTRUSTED_SCRAPE_SYSTEM}\nYou draft Reddit replies for HITL review only. Never claim you posted.`,
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
  const risk =
    o.risk === "low" || o.risk === "medium" || o.risk === "high"
      ? o.risk
      : "medium";
  return {
    ok: true,
    body,
    why:
      typeof o.why === "string"
        ? o.why
        : `Relevant to r/${thread.subreddit} discussion`,
    risk,
  };
}
