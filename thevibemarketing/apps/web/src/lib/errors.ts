/**
 * Single error channel — console today, optional webhook when ERROR_WEBHOOK_URL set.
 * Replace with Sentry later without touching call sites.
 */

export async function reportError(
  scope: string,
  err: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const payload = {
    scope,
    message,
    extra: extra ?? {},
    ts: new Date().toISOString(),
  };

  console.error(`[${scope}]`, message, extra ?? "");

  const hook = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!hook) return;

  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    /* never throw from reporter */
  }
}
