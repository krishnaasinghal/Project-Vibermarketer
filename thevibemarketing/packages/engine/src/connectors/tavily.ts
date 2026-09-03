/**
 * Tavily web search — optional deep public-signal enrichment.
 * Offline: missing TAVILY_API_KEY → empty results.
 *
 * POST https://api.tavily.com/search
 * Auth: Authorization: Bearer $TAVILY_API_KEY
 */

export type TavilyHit = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type TavilySearchResult = {
  ok: boolean;
  answer?: string | null;
  results: TavilyHit[];
  error?: string;
};

export async function tavilySearch(
  query: string,
  opts?: { maxResults?: number; searchDepth?: "basic" | "advanced" },
): Promise<TavilySearchResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, results: [], error: "TAVILY_API_KEY unset" };
  }

  const q = query?.trim();
  if (!q) {
    return { ok: false, results: [], error: "Empty query" };
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: q,
        search_depth: opts?.searchDepth ?? "basic",
        max_results: opts?.maxResults ?? 5,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        results: [],
        error: `Tavily HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        score?: number;
      }>;
    };

    const results: TavilyHit[] = (data.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: String(r.title),
        url: String(r.url),
        content: String(r.content ?? ""),
        score: r.score,
      }));

    return {
      ok: true,
      answer: data.answer ?? null,
      results,
    };
  } catch (e) {
    return {
      ok: false,
      results: [],
      error: e instanceof Error ? e.message : "Tavily search failed",
    };
  }
}
