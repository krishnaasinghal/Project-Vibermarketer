/**
 * Demo / dogfood prefills (Anand operator data).
 * Disabled by default everywhere. Explicitly opt in only for isolated local work.
 */
export function demoDefaultsEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DEMO_DEFAULTS?.trim();
  return v === "1" && process.env.NODE_ENV !== "production";
}
