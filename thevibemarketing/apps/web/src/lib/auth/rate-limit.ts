/**
 * In-memory rate limit for auth + marketing private APIs.
 * Per-instance only (serverless may not share state) — still blocks
 * naive bursts on a warm instance. Prefer Upstash/edge limits for multi-region prod.
 *
 * Buckets used elsewhere:
 * - private-api:{userId} — general authenticated API (withOwnedStore)
 * - marketing-expensive:{owner} — draft / campaign / agents / brand scrape
 * - marketing-publish:{owner} — approve / live publish attempts
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit = 12,
  windowMs = 60_000,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (cur.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }
  cur.count += 1;
  return { ok: true };
}

/** Best-effort client key from request headers. */
export function clientKeyFromHeaders(h: Headers, prefix: string): string {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = h.get("x-real-ip")?.trim();
  const ip = fwd || real || "unknown";
  return `${prefix}:${ip}`;
}
