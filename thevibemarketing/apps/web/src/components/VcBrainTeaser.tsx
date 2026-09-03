import Link from "next/link";

/**
 * Marketing teaching diagram — FIXED numbers on purpose.
 * Live radar/compare use real Identify/Apply gravity; do not confuse the two.
 */
export function VcBrainTeaser({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden border border-line bg-bg-panel ${
        compact ? "p-4" : "p-6 sm:p-8"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 20% 40%, var(--glow-accent), transparent), radial-gradient(ellipse 50% 60% at 85% 60%, var(--glow-cool), transparent)",
        }}
      />
      <p className="relative section-label">Distribution gravity</p>
      <p
        className={`relative mt-3 font-display font-bold tracking-tight ${
          compact ? "text-xl" : "text-2xl sm:text-3xl"
        }`}
      >
        Same check size.{" "}
        <span className="text-accent">Different pull.</span>
      </p>
      <p className="relative mt-2 border-l-2 border-warn/60 pl-3 text-xs leading-relaxed text-muted">
        Teaching diagram with fixed scores (89 vs 27) — not your workspace.
        Open Gravity compare for live founders after Identify or Apply + GitHub.
      </p>
      <div className="relative mt-6 grid grid-cols-2 gap-4 sm:gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Cold-start founder
          </p>
          <p className="mt-1 font-display text-5xl font-bold tabular-nums text-accent sm:text-6xl">
            89
          </p>
          <p className="mt-1 text-xs text-muted">Small audience · high velocity</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Pedigree · quiet
          </p>
          <p className="mt-1 font-display text-5xl font-bold tabular-nums text-ink/50 sm:text-6xl">
            27
          </p>
          <p className="mt-1 text-xs text-muted">Large audience · low pull</p>
        </div>
      </div>
      <div className="relative mt-8 flex flex-wrap gap-3">
        <Link
          href="/app/compare"
          className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
        >
          Open live gravity compare
        </Link>
        {!compact ? (
          <Link
            href="/app/radar"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          >
            Identify on radar
          </Link>
        ) : null}
      </div>
    </div>
  );
}
