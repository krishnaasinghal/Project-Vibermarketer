/**
 * Static hero visual — product UI mock (no canvas / 3D).
 * Prefer this until a real screenshot pipeline exists; motion can layer later.
 */
export function HeroProductPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[480px]"
      aria-hidden
    >
      <div className="overflow-hidden border border-line bg-bg-panel shadow-[0_28px_70px_-32px_var(--shadow-soft)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-line" />
          <span className="h-2 w-2 rounded-full bg-line" />
          <span className="h-2 w-2 rounded-full bg-line" />
          <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-muted">Campaign workspace</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> ready
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Product URL
            </p>
            <p className="mt-1 font-display text-lg font-semibold tracking-tight">
              yourproduct.com
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              ICP, voice, and proof points extracted from your product context.
            </p>
          </div>

          <div className="border border-line bg-bg px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">7-day campaign</p>
              <span className="font-mono text-[10px] text-accent">3 drafts ready</span>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm text-ink/90">
              <li className="flex gap-2">
                <span className="text-accent">01</span>
                Launch thread — problem → proof
              </li>
              <li className="flex gap-2">
                <span className="text-accent">02</span>
                Founder story · short form
              </li>
              <li className="flex gap-2">
                <span className="text-accent">03</span>
                SEO draft · one pillar page
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between gap-3 border border-accent/35 bg-accent/5 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Approval queue</p>
              <p className="text-xs text-muted">You control what reaches every channel</p>
            </div>
            <span className="shrink-0 border border-accent/50 bg-accent/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">
              HITL
            </span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted">
        Illustrative UI · not a live session
      </p>
    </div>
  );
}
