/**
 * Firecrawl connector — credit-aware, production-shaped.
 *
 * Credit model (v2):
 * - map                 → ~1 credit / job (cheap recon)
 * - formats: markdown   → 1 credit / page  (default scrape)
 * - formats: json/LLM   → ~5 credits / page — ONLY when allowExpensiveExtract=true
 * - search + scrapeOpts → search credits + scrape credits
 *
 * Production rule: map/filter first, then markdown scrape. Never blind JSON-extract
 * crawls. LLM structure extraction runs in *our* OpenAI adapter on untrusted
 * markdown (see prompts/untrusted-scrape.ts) so Firecrawl credits stretch.
 *
 * Offline: missing FIRECRAWL_API_KEY → null / empty (no throw).
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

export type FirecrawlMapResult = {
  ok: boolean;
  links: string[];
  error?: string;
};

export type FirecrawlSearchHit = {
  title: string;
  url: string;
  markdown?: string;
  description?: string;
};

export type FirecrawlSearchResult = {
  ok: boolean;
  hits: FirecrawlSearchHit[];
  error?: string;
};

export type DiscoverThenScrapeResult = {
  ok: boolean;
  /** Pages chosen after map filter (or [url] if map empty). */
  targets: string[];
  /** Markdown from the primary target (1 credit). */
  markdown: string | null;
  primaryUrl: string;
  creditsHint: string;
  error?: string;
};

function apiKey(): string | null {
  return process.env.FIRECRAWL_API_KEY?.trim() || null;
}

function authHeaders(key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

/**
 * PILLAR 01 — Cheap reconnaissance map (~1 credit).
 * Narrows a domain to about/team/founder/launch style anchors before scraping.
 */
export async function mapSite(
  domainOrUrl: string,
  opts?: { search?: string; limit?: number },
): Promise<FirecrawlMapResult> {
  const key = apiKey();
  if (!key) return { ok: false, links: [], error: "FIRECRAWL_API_KEY unset" };

  let url = domainOrUrl.trim();
  if (!url) return { ok: false, links: [], error: "Empty domain" };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/map`, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify({
        url,
        search: opts?.search ?? "about|team|founder|story|launch|product",
        limit: opts?.limit ?? 8,
      }),
    });
    if (!res.ok) {
      return { ok: false, links: [], error: `Firecrawl map HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      success?: boolean;
      links?: Array<string | { url?: string }>;
    };
    const links = (body.links ?? [])
      .map((l) => (typeof l === "string" ? l : l.url || ""))
      .filter(Boolean)
      .slice(0, opts?.limit ?? 8);
    return { ok: links.length > 0, links };
  } catch (e) {
    return {
      ok: false,
      links: [],
      error: e instanceof Error ? e.message : "Firecrawl map failed",
    };
  }
}

/**
 * Plain markdown scrape (1 credit). Default path for brand + gravity audit.
 */
export async function scrapeMarkdown(url: string): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  const target = url?.trim();
  if (!target) return null;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify({
        url: target,
        formats: ["markdown"],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      success?: boolean;
      data?: { markdown?: string | null };
    };
    const md = body.data?.markdown;
    return typeof md === "string" && md.length > 0 ? md : null;
  } catch {
    return null;
  }
}

/**
 * Expensive JSON/LLM extract (~5 credits). Gated — do not call from crawls.
 * Prefer scrapeMarkdown + our OpenAI completeJson with untrusted-container prompt.
 */
export async function scrapeJsonExtract(
  url: string,
  schema: Record<string, unknown>,
  promptHint?: string,
): Promise<unknown | null> {
  const key = apiKey();
  if (!key) return null;
  if (process.env.FIRECRAWL_ALLOW_JSON_EXTRACT !== "1") {
    // Fail closed: wallet protection. Opt-in via env for rare one-off runs.
    return null;
  }

  const target = url?.trim();
  if (!target) return null;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify({
        url: target,
        formats: [
          {
            type: "json",
            schema,
            prompt: promptHint,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      success?: boolean;
      data?: { json?: unknown };
    };
    return body.data?.json ?? null;
  } catch {
    return null;
  }
}

/**
 * Web search with optional markdown scrape on hits.
 * Keep resultLimit low (2–3) — each scraped page costs extra.
 */
export async function firecrawlSearch(
  query: string,
  opts?: { limit?: number; scrapeMarkdown?: boolean },
): Promise<FirecrawlSearchResult> {
  const key = apiKey();
  if (!key) return { ok: false, hits: [], error: "FIRECRAWL_API_KEY unset" };

  const q = query?.trim();
  if (!q) return { ok: false, hits: [], error: "Empty query" };

  const limit = Math.min(opts?.limit ?? 3, 5);

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify({
        query: q,
        limit,
        ...(opts?.scrapeMarkdown
          ? { scrapeOptions: { formats: ["markdown"] } }
          : {}),
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        hits: [],
        error: `Firecrawl search HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      success?: boolean;
      data?: Array<{
        title?: string;
        url?: string;
        description?: string;
        markdown?: string;
      }>;
    };
    const hits: FirecrawlSearchHit[] = (body.data ?? [])
      .filter((d) => d.url)
      .map((d) => ({
        title: d.title || "Untitled",
        url: String(d.url),
        description: d.description,
        markdown: d.markdown,
      }));
    return { ok: hits.length > 0, hits };
  } catch (e) {
    return {
      ok: false,
      hits: [],
      error: e instanceof Error ? e.message : "Firecrawl search failed",
    };
  }
}

/**
 * Two-step outbound recon: map (cheap) → markdown scrape primary target (1 credit).
 * This is the wallet-safe path for domain → brand / founder pages.
 */
export async function discoverThenScrapeMarkdown(
  domainOrUrl: string,
  opts?: { search?: string; mapLimit?: number },
): Promise<DiscoverThenScrapeResult> {
  const key = apiKey();
  let primary = domainOrUrl.trim();
  if (!primary) {
    return {
      ok: false,
      targets: [],
      markdown: null,
      primaryUrl: "",
      creditsHint: "0",
      error: "Empty URL",
    };
  }
  if (!/^https?:\/\//i.test(primary)) primary = `https://${primary}`;

  if (!key) {
    return {
      ok: false,
      targets: [primary],
      markdown: null,
      primaryUrl: primary,
      creditsHint: "0 (no key)",
      error: "FIRECRAWL_API_KEY unset",
    };
  }

  const mapped = await mapSite(primary, {
    search: opts?.search,
    limit: opts?.mapLimit ?? 6,
  });
  const targets =
    mapped.links.length > 0
      ? mapped.links
      : [primary];
  const primaryUrl = targets[0]!;
  const markdown = await scrapeMarkdown(primaryUrl);

  return {
    ok: Boolean(markdown),
    targets,
    markdown,
    primaryUrl,
    creditsHint: mapped.links.length
      ? "~2 (map + 1 markdown scrape)"
      : "~1 (markdown scrape only)",
    error: markdown ? undefined : mapped.error || "Scrape returned empty",
  };
}
