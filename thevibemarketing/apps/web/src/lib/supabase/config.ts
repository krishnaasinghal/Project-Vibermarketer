/** Public Supabase env — never put service_role here. */

export function getSupabaseUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return url || undefined;
}

export function getSupabasePublishableKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return key || undefined;
}

/** True when URL + publishable key are present. */
export function isAuthConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

/**
 * Local/dev escape hatch: skip /app gate when auth isn't configured,
 * or when AUTH_BYPASS=1 is set explicitly.
 */
export function isAuthBypassed(): boolean {
  if (process.env.AUTH_BYPASS === "1") return true;
  if (process.env.AUTH_BYPASS === "0") return false;
  return !isAuthConfigured();
}

/** True on a real production host (Vercel/Render/Netlify), not every local `next build`. */
function isHostedProduction(): boolean {
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.RENDER === "true" && process.env.NODE_ENV === "production") {
    return true;
  }
  if (process.env.CONTEXT === "production") return true; // Netlify
  return false;
}

/**
 * Refuse hosted production boots that leave /app open.
 * Opt-out only with ALLOW_OPEN_APP=1 (explicit demo deploy).
 * Local `next build` without platform env only hard-fails on AUTH_BYPASS=1.
 */
export function assertProductionAuthSafe(): void {
  if (process.env.ALLOW_OPEN_APP === "1") {
    if (isHostedProduction() || process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] ALLOW_OPEN_APP=1 — /app may be open without login. Remove before real users.",
      );
    }
    return;
  }

  if (process.env.AUTH_BYPASS === "1" && process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_BYPASS=1 is forbidden in production builds. Set AUTH_BYPASS=0 and configure Supabase, or set ALLOW_OPEN_APP=1 only for an intentional open demo.",
    );
  }

  if (!isHostedProduction()) return;

  if (!isAuthConfigured()) {
    throw new Error(
      "Production requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. /app must not ship open. Set ALLOW_OPEN_APP=1 only for an intentional open demo.",
    );
  }
}

/** Only allow same-origin relative paths (open-redirect safe). */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/app/cmo",
): string {
  const safeFallback =
    fallback.startsWith("/") &&
    !fallback.includes("://") &&
    !fallback.includes("//") &&
    !fallback.includes("\\") &&
    !fallback.includes("\0")
      ? fallback
      : "/app/cmo";
  if (!raw) return safeFallback;
  if (
    !raw.startsWith("/") ||
    raw.includes("://") ||
    raw.includes("//")
  ) {
    return safeFallback;
  }
  if (raw.includes("\\") || raw.includes("\0")) return safeFallback;
  return raw;
}

const REDIRECT_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "vibemarketer.fun",
  "www.vibemarketer.fun",
]);

/** Final defense for callback redirects after resolving the relative next path. */
export function isAllowedRedirectUrl(target: URL, requestOrigin: string): boolean {
  if (target.origin === requestOrigin) return true;

  const allowedHosts = new Set(REDIRECT_HOSTS);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      allowedHosts.add(new URL(siteUrl).hostname.toLowerCase());
    } catch {
      /* Ignore invalid optional site URL. */
    }
  }

  return (
    (target.protocol === "http:" || target.protocol === "https:") &&
    allowedHosts.has(target.hostname.toLowerCase())
  );
}
