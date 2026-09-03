/** Canonical site identity — SEO / AEO / social share source of truth. */

// Relative import — next.config and some tooling resolve this more reliably than `@/`.
import { DOGFOOD_OPERATOR } from "../content/dogfood-operator";

export const SITE_NAME = "vibemarketer";
/** Apex brand domain (marketing). */
export const SITE_DOMAIN = "vibemarketer.fun";
/** Canonical production host — keep auth cookies on one host. */
export const SITE_CANONICAL_HOST = "www.vibemarketer.fun";
export const SITE_CANONICAL_URL = `https://${SITE_CANONICAL_HOST}`;

export const SITE_TAGLINE =
  "Paste your product URL. Get a brand brief, campaign plan, and drafts you approve.";
export const SITE_DESCRIPTION =
  "vibemarketer helps technical SaaS founders turn a product URL into on-brand launch drafts, then approve what goes live — brand memory, multi-channel drafts, and HITL before anything publishes.";

function normalizeBase(raw: string): string {
  let base = raw.trim().replace(/\/$/, "");
  // Collapse apex → www so auth/cookies stay consistent.
  if (base === "https://vibemarketer.fun" || base === "http://vibemarketer.fun") {
    base = SITE_CANONICAL_URL;
  }
  return base;
}

export function siteUrl(path = ""): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = normalizeBase(fromEnv || SITE_CANONICAL_URL);
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export { assertProductionSiteUrl } from "./assert-site-url";

export const SITE_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "anandcollege07@gmail.com";

/** Booking URL — Calendly for Anand, or env override. Bare cal.com ignored. */
export const CAL_URL = (() => {
  const raw =
    process.env.NEXT_PUBLIC_CAL_URL?.trim() || DOGFOOD_OPERATOR.calendly_url;
  if (!raw || raw === "https://cal.com" || raw === "https://cal.com/") {
    return DOGFOOD_OPERATOR.calendly_url;
  }
  return raw;
})();

export const BOOKING_HREF =
  CAL_URL || `mailto:${SITE_EMAIL}?subject=vibemarketer%20demo`;
export const BOOKING_LABEL = CAL_URL ? "Book a call" : "Email us";

export const SOCIAL = {
  x: process.env.NEXT_PUBLIC_X_URL || DOGFOOD_OPERATOR.x_url,
  github: process.env.NEXT_PUBLIC_GITHUB_URL || DOGFOOD_OPERATOR.github_url,
  linkedin:
    process.env.NEXT_PUBLIC_LINKEDIN_URL || DOGFOOD_OPERATOR.linkedin_url,
  portfolio: DOGFOOD_OPERATOR.portfolio_url,
  operator: DOGFOOD_OPERATOR.name,
  x_handle: DOGFOOD_OPERATOR.x_handle,
} as const;

/** Public marketing routes (sitemap + AEO feeds). */
export const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/product", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/connectors", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/pricing", priority: 0.85, changeFrequency: "monthly" as const },
  { path: "/vc-brain", priority: 0.3, changeFrequency: "monthly" as const },
  {
    path: "/tools/gravity-audit",
    priority: 0.5,
    changeFrequency: "monthly" as const,
  },
  { path: "/blog", priority: 0.75, changeFrequency: "weekly" as const },
  { path: "/newsletter", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/guides", priority: 0.75, changeFrequency: "weekly" as const },
  { path: "/get-started", priority: 0.85, changeFrequency: "monthly" as const },
  { path: "/demo", priority: 0.7, changeFrequency: "monthly" as const },
] as const;

export const KEYWORDS = [
  "Cursor for marketing",
  "vibemarketer",
  "AI marketing operating system",
  "AI CMO for SaaS founders",
  "SaaS marketing drafts",
  "AI marketing for founders",
  "HITL marketing",
  "brand memory",
  "SaaS distribution",
  "agentic marketing",
  "SEO AEO",
  "GEO marketing",
  "generative engine optimization",
  "answer engine optimization",
  "Reddit marketing for SaaS",
  "launch drafts for startups",
] as const;

/** Google OAuth button — only when Supabase Google provider is enabled. */
export function isGoogleOAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_OAUTH === "1";
}
