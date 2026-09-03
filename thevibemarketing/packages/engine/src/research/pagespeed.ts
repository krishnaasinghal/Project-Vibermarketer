/**
 * Optional Google PageSpeed Insights (Lighthouse) fetch.
 * Set PAGESPEED_API_KEY or GOOGLE_API_KEY for real lab scores.
 * Without a key, returns null — callers use heuristic scorecard.
 */

export type PageSpeedScores = {
  strategy: "mobile" | "desktop";
  performance: number;
  accessibility: number;
  best_practices: number;
  seo: number;
  lcp_ms: number | null;
  fcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  source: "pagespeed_insights";
  fetch_error?: string;
};

function apiKey(): string | null {
  return (
    process.env.PAGESPEED_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null
  );
}

export function isPageSpeedConfigured(): boolean {
  return Boolean(apiKey());
}

function catScore(
  cats: Record<string, { score?: number | null }> | undefined,
  id: string,
): number {
  const s = cats?.[id]?.score;
  if (typeof s !== "number" || Number.isNaN(s)) return 0;
  return Math.round(s * 100);
}

function metric(
  audits: Record<string, { numericValue?: number }> | undefined,
  id: string,
): number | null {
  const v = audits?.[id]?.numericValue;
  return typeof v === "number" ? v : null;
}

export async function fetchPageSpeed(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<PageSpeedScores | null> {
  const key = apiKey();
  if (!key) return null;

  const u = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  u.searchParams.set("url", url);
  u.searchParams.set("strategy", strategy);
  u.searchParams.set("key", key);
  for (const c of [
    "PERFORMANCE",
    "ACCESSIBILITY",
    "BEST_PRACTICES",
    "SEO",
  ]) {
    u.searchParams.append("category", c);
  }

  try {
    const res = await fetch(u.toString(), {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return {
        strategy,
        performance: 0,
        accessibility: 0,
        best_practices: 0,
        seo: 0,
        lcp_ms: null,
        fcp_ms: null,
        cls: null,
        tbt_ms: null,
        source: "pagespeed_insights",
        fetch_error: `PageSpeed HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      lighthouseResult?: {
        categories?: Record<string, { score?: number | null }>;
        audits?: Record<string, { numericValue?: number }>;
      };
    };
    const cats = body.lighthouseResult?.categories;
    const audits = body.lighthouseResult?.audits;
    return {
      strategy,
      performance: catScore(cats, "performance"),
      accessibility: catScore(cats, "accessibility"),
      best_practices: catScore(cats, "best-practices"),
      seo: catScore(cats, "seo"),
      lcp_ms: metric(audits, "largest-contentful-paint"),
      fcp_ms: metric(audits, "first-contentful-paint"),
      cls: metric(audits, "cumulative-layout-shift"),
      tbt_ms: metric(audits, "total-blocking-time"),
      source: "pagespeed_insights",
    };
  } catch (e) {
    return {
      strategy,
      performance: 0,
      accessibility: 0,
      best_practices: 0,
      seo: 0,
      lcp_ms: null,
      fcp_ms: null,
      cls: null,
      tbt_ms: null,
      source: "pagespeed_insights",
      fetch_error: e instanceof Error ? e.message : "PageSpeed failed",
    };
  }
}
