/** Kept separate from site.ts so next.config can import without path-alias content modules. */

/** Fail hosted deploys that still point SITE_URL at localhost. */
export function assertProductionSiteUrl(): void {
  const hosted =
    process.env.VERCEL_ENV === "production" ||
    process.env.CONTEXT === "production" ||
    (process.env.RENDER === "true" && process.env.NODE_ENV === "production");
  if (!hosted) return;

  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is required in production (use https://www.vibemarketer.fun).",
    );
  }
  if (/localhost|127\.0\.0\.1/i.test(raw)) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL must not be localhost in production (got ${raw}). Set https://www.vibemarketer.fun`,
    );
  }
  if (!raw.startsWith("https://")) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL must be https in production (got ${raw}).`,
    );
  }
}
