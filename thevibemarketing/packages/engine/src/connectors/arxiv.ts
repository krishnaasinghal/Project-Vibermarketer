import type { NormalizedIngestItem } from "./types";
import type { SourceFetchResult } from "./github";

/**
 * arXiv Atom API — research-founder signal (brief §5 outbound sources).
 */
export async function fetchArxivAi(
  limit = 10,
): Promise<NormalizedIngestItem[]> {
  const r = await fetchArxivAiDetailed(limit);
  return r.items;
}

export async function fetchArxivAiDetailed(
  limit = 10,
): Promise<SourceFetchResult> {
  try {
    const q = encodeURIComponent(
      'cat:cs.AI OR cat:cs.LG OR all:"foundation model"',
    );
    const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "thevibemarketing-vcbrain" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return {
        items: [],
        ok: false,
        status: res.status,
        error: `arXiv HTTP ${res.status}`,
      };
    }
    const xml = await res.text();
    const entries = xml.split("<entry>").slice(1);
    const items: NormalizedIngestItem[] = [];

    for (const entry of entries.slice(0, limit)) {
      const id = entry.match(/<id>([^<]+)<\/id>/)?.[1] ?? "";
      const title =
        entry
          .match(/<title>([\s\S]*?)<\/title>/)?.[1]
          ?.replace(/\s+/g, " ")
          .trim() ?? "Untitled";
      const author =
        entry.match(/<name>([^<]+)<\/name>/)?.[1]?.trim() ?? "unknown";
      const published =
        entry.match(/<published>([^<]+)<\/published>/)?.[1] ??
        new Date().toISOString();
      const absUrl = id.includes("arxiv.org")
        ? id
        : `https://arxiv.org/abs/${id.split("/").pop()}`;
      const externalId = absUrl.split("/").pop() || String(items.length);

      items.push({
        source: "arxiv",
        external_id: externalId,
        title,
        author,
        url: absUrl,
        observed_at: published,
        metrics: { papers: 1, engagement: 1 },
        raw: { title, author },
      });
    }

    return { items, ok: true, status: res.status };
  } catch (e) {
    return {
      items: [],
      ok: false,
      error: e instanceof Error ? e.message : "arXiv fetch failed",
    };
  }
}
