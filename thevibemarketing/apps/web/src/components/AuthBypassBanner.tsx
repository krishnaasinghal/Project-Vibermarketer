import { isAuthBypassed, isAuthConfigured } from "@/lib/supabase/config";

/**
 * Unmissable when /app is open without login.
 * Must stay visible in any deploy that ships with bypass — not a quiet toast.
 */
export function AuthBypassBanner() {
  if (!isAuthBypassed()) return null;

  const reason =
    process.env.AUTH_BYPASS === "1"
      ? "AUTH_BYPASS=1"
      : !isAuthConfigured()
        ? "Supabase env unset"
        : "auth bypass";

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] border-b-2 border-danger bg-danger/20 px-4 py-2.5 text-center"
    >
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-danger sm:text-sm">
        Auth disabled — /app is open without login ({reason})
      </p>
      <p className="mt-0.5 text-[11px] text-danger/90 sm:text-xs">
        Do not ship this to real users. Set{" "}
        <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
        <span className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span>, then{" "}
        <span className="font-mono">AUTH_BYPASS=0</span>.
      </p>
    </div>
  );
}
