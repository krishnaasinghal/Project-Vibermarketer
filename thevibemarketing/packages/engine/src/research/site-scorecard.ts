/**
 * Site health + GEO scorecard (heuristic).
 * Not official Google Lighthouse — labeled honestly.
 * Covers: fetchability, SEO basics, AEO/GEO surfaces, security basics.
 */

import { fetchPublicText } from "./public-http";

export type ScoreCheck = {
  id: string;
  category: "seo" | "geo" | "performance" | "a11y" | "security" | "content";
  label: string;
  pass: boolean;
  weight: number;
  detail: string;
};

export type SiteScorecard = {
  url: string;
  ok: boolean;
  fetched: boolean;
  scores: {
    overall: number;
    seo: number;
    geo: number;
    performance: number;
    a11y: number;
    security: number;
  };
  checks: ScoreCheck[];
  /** Lighthouse-like 0–100 buckets (heuristic synthesis) */
  lighthouse_style: {
    performance: number;
    accessibility: number;
    best_practices: number;
    seo: number;
    note: string;
  };
  recommendations: string[];
  error?: string;
  error_code?: "INVALID_URL" | "UNSAFE_URL" | "FETCH_FAILED";
  measured_at: string;
};

function scoreCategory(
  checks: ScoreCheck[],
  category: ScoreCheck["category"],
): number {
  const subset = checks.filter((c) => c.category === category);
  if (!subset.length) return 0;
  const totalW = subset.reduce((s, c) => s + c.weight, 0);
  const got = subset.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  return Math.round((got / totalW) * 100);
}

function hasTag(html: string, re: RegExp): boolean {
  return re.test(html);
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "i",
  );
  return html.match(re)?.[1] || html.match(re2)?.[1] || null;
}

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return url;
  }
}

/**
 * Run heuristic site + GEO scorecard for a public URL.
 */
export async function runSiteScorecard(rawUrl: string): Promise<SiteScorecard> {
  const measured_at = new Date().toISOString();
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return emptyFail(url, "Invalid URL", measured_at, "INVALID_URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return emptyFail(
      url,
      "Only public http(s) URLs are supported",
      measured_at,
      "INVALID_URL",
    );
  }

  const home = await fetchPublicText(parsed.toString());
  if (!home.ok) {
    return emptyFail(
      parsed.toString(),
      home.error || `Homepage fetch failed (${home.status || "network"})`,
      measured_at,
      home.errorCode === "UNSAFE_URL" ? "UNSAFE_URL" : "FETCH_FAILED",
    );
  }

  const finalUrl = new URL(home.url);
  const origin = originOf(finalUrl.toString());
  const [robots, sitemap, llms, llmsFull] = await Promise.all([
    fetchPublicText(`${origin}/robots.txt`, 8_000),
    fetchPublicText(`${origin}/sitemap.xml`, 8_000),
    fetchPublicText(`${origin}/llms.txt`, 8_000),
    fetchPublicText(`${origin}/llms-full.txt`, 8_000),
  ]);

  const html = home.text;
  const checks: ScoreCheck[] = [];

  // Security
  checks.push({
    id: "https",
    category: "security",
    label: "HTTPS",
    pass: finalUrl.protocol === "https:",
    weight: 3,
    detail:
      finalUrl.protocol === "https:"
        ? "Site served over HTTPS"
        : "Use HTTPS for trust and SEO",
  });

  // Performance (heuristic from TTFB-ish fetch)
  checks.push({
    id: "ttfb",
    category: "performance",
    label: "Response time",
    pass: home.ok && home.ms < 2500,
    weight: 2,
    detail: home.ok
      ? `HTML fetched in ${home.ms}ms (heuristic; not Lighthouse lab data)`
      : "Could not fetch homepage",
  });
  checks.push({
    id: "html_size",
    category: "performance",
    label: "HTML weight",
    pass: home.ok && html.length < 800_000,
    weight: 1,
    detail: home.ok
      ? `Document ~${Math.round(html.length / 1024)}KB (capped sample)`
      : "n/a",
  });

  // SEO
  const title =
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  checks.push({
    id: "title",
    category: "seo",
    label: "Title tag",
    pass: Boolean(title && title.length >= 10 && title.length <= 70),
    weight: 3,
    detail: title ? `“${title.slice(0, 80)}”` : "Missing <title>",
  });
  const desc = extractMeta(html, "description");
  checks.push({
    id: "meta_description",
    category: "seo",
    label: "Meta description",
    pass: Boolean(desc && desc.length >= 50),
    weight: 2,
    detail: desc ? desc.slice(0, 120) : "Missing meta description",
  });
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  checks.push({
    id: "h1",
    category: "seo",
    label: "H1 heading",
    pass: Boolean(h1 && h1.replace(/<[^>]+>/g, "").trim().length > 2),
    weight: 2,
    detail: h1
      ? h1.replace(/<[^>]+>/g, "").trim().slice(0, 80)
      : "No H1 found",
  });
  checks.push({
    id: "canonical",
    category: "seo",
    label: "Canonical link",
    pass: /rel=["']canonical["']/i.test(html),
    weight: 1,
    detail: /rel=["']canonical["']/i.test(html)
      ? "Canonical present"
      : "Add rel=canonical",
  });
  checks.push({
    id: "robots_txt",
    category: "seo",
    label: "robots.txt",
    pass: robots.ok && robots.text.length > 0,
    weight: 1,
    detail: robots.ok ? "robots.txt reachable" : "Missing or blocked robots.txt",
  });
  checks.push({
    id: "sitemap",
    category: "seo",
    label: "sitemap.xml",
    pass: sitemap.ok && /urlset|sitemapindex/i.test(sitemap.text),
    weight: 2,
    detail: sitemap.ok ? "Sitemap found" : "Add /sitemap.xml",
  });
  const og = extractMeta(html, "og:title") || extractMeta(html, "og:image");
  checks.push({
    id: "open_graph",
    category: "seo",
    label: "Open Graph",
    pass: Boolean(og),
    weight: 1,
    detail: og ? "OG tags present" : "Add og:title / og:image for shares",
  });

  // GEO / AEO
  checks.push({
    id: "llms_txt",
    category: "geo",
    label: "llms.txt",
    pass: llms.ok && llms.text.length > 20,
    weight: 3,
    detail: llms.ok
      ? "llms.txt present — good for LLM citation"
      : "Add /llms.txt for AEO/GEO",
  });
  checks.push({
    id: "llms_full",
    category: "geo",
    label: "llms-full.txt",
    pass: llmsFull.ok && llmsFull.text.length > 40,
    weight: 1,
    detail: llmsFull.ok ? "Extended LLM feed found" : "Optional llms-full.txt",
  });
  const hasJsonLd =
    /application\/ld\+json/i.test(html) ||
    /"@type"\s*:/i.test(html);
  checks.push({
    id: "json_ld",
    category: "geo",
    label: "JSON-LD schema",
    pass: hasJsonLd,
    weight: 3,
    detail: hasJsonLd
      ? "Structured data detected"
      : "Add FAQ/Organization JSON-LD for AI Overviews",
  });
  checks.push({
    id: "faq_signal",
    category: "geo",
    label: "FAQ / Q&A signal",
    pass: /faq|frequently asked|@type"\s*:\s*"FAQPage/i.test(html),
    weight: 2,
    detail: /faq|frequently asked|FAQPage/i.test(html)
      ? "FAQ content/schema signal"
      : "Add FAQ section + FAQPage schema for GEO",
  });

  // A11y heuristics
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgsWithAlt = imgs.filter((t) => /alt\s*=\s*["'][^"']+["']/i.test(t));
  checks.push({
    id: "img_alt",
    category: "a11y",
    label: "Image alt text",
    pass: imgs.length === 0 || imgsWithAlt.length / imgs.length >= 0.5,
    weight: 2,
    detail:
      imgs.length === 0
        ? "No images in sample"
        : `${imgsWithAlt.length}/${imgs.length} imgs with alt`,
  });
  checks.push({
    id: "lang",
    category: "a11y",
    label: "html lang",
    pass: /<html[^>]+lang=/i.test(html),
    weight: 1,
    detail: /<html[^>]+lang=/i.test(html)
      ? "lang attribute set"
      : "Set <html lang=…>",
  });

  // Content
  checks.push({
    id: "fetch_ok",
    category: "content",
    label: "Homepage fetchable",
    pass: home.ok,
    weight: 3,
    detail: home.ok
      ? `HTTP ${home.status}`
      : `Failed (status ${home.status || "network"})`,
  });

  const seo = scoreCategory(checks, "seo");
  const geo = scoreCategory(checks, "geo");
  const performance = scoreCategory(checks, "performance");
  const a11y = scoreCategory(checks, "a11y");
  const security = scoreCategory(checks, "security");
  const content = scoreCategory(checks, "content");

  const overall = Math.round(
    seo * 0.28 +
      geo * 0.28 +
      performance * 0.12 +
      a11y * 0.12 +
      security * 0.1 +
      content * 0.1,
  );

  const recommendations = checks
    .filter((c) => !c.pass)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((c) => `${c.label}: ${c.detail}`);

  return {
    url: finalUrl.toString(),
    ok: home.ok,
    fetched: home.ok,
    scores: {
      overall,
      seo,
      geo,
      performance,
      a11y,
      security,
    },
    checks,
    lighthouse_style: {
      // Synthetic buckets — NOT Chrome Lighthouse CI
      performance,
      accessibility: a11y,
      best_practices: Math.round((security + content) / 2),
      seo: Math.round(seo * 0.65 + geo * 0.35),
      note: "Heuristic scorecard (vibemarketer). Not official Google Lighthouse lab metrics.",
    },
    recommendations,
    error: home.ok ? undefined : `Homepage fetch failed (${home.status || "network"})`,
    measured_at,
  };
}

function emptyFail(
  url: string,
  error: string,
  measured_at: string,
  error_code: SiteScorecard["error_code"] = "FETCH_FAILED",
): SiteScorecard {
  return {
    url,
    ok: false,
    fetched: false,
    scores: {
      overall: 0,
      seo: 0,
      geo: 0,
      performance: 0,
      a11y: 0,
      security: 0,
    },
    checks: [],
    lighthouse_style: {
      performance: 0,
      accessibility: 0,
      best_practices: 0,
      seo: 0,
      note: "Heuristic scorecard — run failed",
    },
    recommendations: [error],
    error,
    error_code,
    measured_at,
  };
}
