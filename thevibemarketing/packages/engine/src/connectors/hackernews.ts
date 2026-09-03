import type { NormalizedIngestItem } from "./types";
import type { SourceFetchResult } from "./github";

export async function fetchShowHn(limit = 20): Promise<NormalizedIngestItem[]> {
  const r = await fetchShowHnDetailed(limit);
  return r.items;
}

function mapHnHits(
  hits: Array<{
    objectID: string;
    title: string;
    author: string;
    url?: string;
    points?: number;
    created_at: string;
  }>,
): NormalizedIngestItem[] {
  return hits.map((h) => ({
    source: "hackernews" as const,
    external_id: h.objectID,
    title: h.title,
    author: h.author,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    observed_at: h.created_at,
    metrics: { hn_points: h.points ?? 0, engagement: h.points ?? 0 },
    raw: h,
  }));
}

export async function fetchShowHnDetailed(limit = 20): Promise<SourceFetchResult> {
  try {
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=${limit}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "thevibemarketing-vcbrain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        items: [],
        ok: false,
        status: res.status,
        error: `HN HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      hits?: Array<{
        objectID: string;
        title: string;
        author: string;
        url?: string;
        points?: number;
        created_at: string;
      }>;
    };
    return { items: mapHnHits(data.hits ?? []), ok: true, status: res.status };
  } catch (e) {
    return {
      items: [],
      ok: false,
      error: e instanceof Error ? e.message : "HN fetch failed",
    };
  }
}

/** Public Algolia HN search (no key) — used by Gravity Audit deep path. */
export async function searchHnStories(
  query: string,
  limit = 8,
): Promise<SourceFetchResult> {
  const q = query?.trim();
  if (!q) {
    return { items: [], ok: false, error: "Empty HN query" };
  }
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=${limit}&tags=story`;
    const res = await fetch(url, {
      headers: { "User-Agent": "thevibemarketing-vcbrain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        items: [],
        ok: false,
        status: res.status,
        error: `HN search HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      hits?: Array<{
        objectID: string;
        title: string;
        author: string;
        url?: string;
        points?: number;
        created_at: string;
      }>;
    };
    return { items: mapHnHits(data.hits ?? []), ok: true, status: res.status };
  } catch (e) {
    return {
      items: [],
      ok: false,
      error: e instanceof Error ? e.message : "HN search failed",
    };
  }
}
