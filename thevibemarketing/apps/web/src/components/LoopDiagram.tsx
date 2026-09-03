const STEPS = [
  { key: "CONTEXT", desc: "Save product, ICP, voice, and proof" },
  { key: "PLAN", desc: "Shape a focused campaign from brand context" },
  { key: "CREATE", desc: "Draft posts, threads, assets" },
  { key: "APPROVE", desc: "HITL quality and brand check" },
  { key: "PUBLISH", desc: "Provider-confirmed publishing" },
  { key: "REVIEW", desc: "Review what shipped and what to change" },
] as const;

export function LoopDiagram() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((step, i) => (
        <div
          key={step.key}
          className={`panel pulse-loop flex flex-col gap-2 p-4 ${
            i === 3 ? "[animation-delay:0.4s]" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-display text-lg font-semibold tracking-wide">
              {step.key}
            </span>
          </div>
          <p className="text-sm text-muted">{step.desc}</p>
        </div>
      ))}
    </div>
  );
}
