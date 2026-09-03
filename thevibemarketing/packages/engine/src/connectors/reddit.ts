/**
 * Reddit public JSON search — no OAuth required for read/search.
 * Respect rate limits; always identify User-Agent.
 * Writing still goes through HITL + Composio (never auto-post).
 */

const UA =
  process.env.REDDIT_USER_AGENT?.trim() ||
  "vibemarketer/0.1 (by /u/vibemarketer; marketing research bot; contact site)";

export type RedditThread = {
  id: string;
  fullname: string;
  title: string;
  subreddit: string;
  author: string;
  url: string;
  permalink: string;
  selftext: string;
  score: number;
  num_comments: number;
  created_utc: number;
  over_18: boolean;
};

export type RedditSearchResult = {
  ok: boolean;
  threads: RedditThread[];
  query: string;
  error?: string;
};

function mapChild(c: {
  data?: {
    id?: string;
    name?: string;
    title?: string;
    subreddit?: string;
    author?: string;
    url?: string;
    permalink?: string;
    selftext?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    over_18?: boolean;
    stickied?: boolean;
  };
}): RedditThread | null {
  const d = c.data;
  if (!d?.id || !d.title || !d.subreddit) return null;
  if (d.stickied) return null;
  const permalink = d.permalink
    ? d.permalink.startsWith("http")
      ? d.permalink
      : `https://www.reddit.com${d.permalink}`
    : `https://www.reddit.com/comments/${d.id}`;
  return {
    id: d.id,
    fullname: d.name || `t3_${d.id}`,
    title: d.title,
    subreddit: d.subreddit,
    author: d.author || "[deleted]",
    url: d.url || permalink,
    permalink,
    selftext: (d.selftext || "").slice(0, 2000),
    score: d.score ?? 0,
    num_comments: d.num_comments ?? 0,
    created_utc: d.created_utc ?? 0,
    over_18: Boolean(d.over_18),
  };
}

/**
 * Search Reddit for discussion opportunities.
 * Uses public search.json (no auth). Filters NSFW.
 */
export async function searchRedditThreads(opts: {
  query: string;
  limit?: number;
  sort?: "relevance" | "new" | "top" | "comments";
  time?: "hour" | "day" | "week" | "month" | "year" | "all";
  /** Optional subreddit restrict (without r/) */
  subreddit?: string;
}): Promise<RedditSearchResult> {
  const q = opts.query.trim();
  if (!q) {
    return { ok: false, threads: [], query: q, error: "empty query" };
  }
  const limit = Math.min(25, Math.max(1, opts.limit ?? 8));
  const sort = opts.sort ?? "relevance";
  const time = opts.time ?? "week";

  const params = new URLSearchParams({
    q,
    sort,
    t: time,
    limit: String(limit),
    type: "link",
    raw_json: "1",
  });

  const path = opts.subreddit?.trim()
    ? `https://www.reddit.com/r/${encodeURIComponent(opts.subreddit.trim().replace(/^r\//, ""))}/search.json?${params}&restrict_sr=1`
    : `https://www.reddit.com/search.json?${params}`;

  try {
    const res = await fetch(path, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        threads: [],
        query: q,
        error: `Reddit HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      data?: { children?: Array<{ data?: Record<string, unknown> }> };
    };
    const threads = (body.data?.children ?? [])
      .map((c) => mapChild(c as Parameters<typeof mapChild>[0]))
      .filter((t): t is RedditThread => Boolean(t && !t.over_18))
      .slice(0, limit);

    return { ok: true, threads, query: q };
  } catch (e) {
    return {
      ok: false,
      threads: [],
      query: q,
      error: e instanceof Error ? e.message : "Reddit search failed",
    };
  }
}

/** Build search queries from brand ICP/pillars. */
export function redditQueriesFromBrand(brand: {
  name: string;
  oneliner: string;
  icp: string;
  pillars: string[];
}): string[] {
  const pillars = brand.pillars.filter(Boolean).slice(0, 3);
  const queries = [
    `${brand.name} OR ${brand.oneliner.split(/[.!?,]/)[0]?.slice(0, 48) || brand.name}`,
    brand.icp.split(/[,.]/)[0]?.trim().slice(0, 60),
    ...pillars.map((p) => `${p} SaaS OR startup OR tool`),
  ].filter((q): q is string => Boolean(q && q.length > 3));
  return [...new Set(queries)].slice(0, 4);
}
