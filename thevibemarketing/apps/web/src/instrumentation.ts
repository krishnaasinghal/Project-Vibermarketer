/**
 * Next.js instrumentation — runs once on server boot.
 * Blocks production when auth would silently leave /app open.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertProductionAuthSafe } = await import("@/lib/supabase/config");
  assertProductionAuthSafe();
}