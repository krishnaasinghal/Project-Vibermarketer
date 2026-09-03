type Step = {
  label: string;
  detail?: string;
};

type Props = {
  title?: string;
  caption?: string;
  steps: Step[];
  /** Horizontal on sm+, stacked on mobile */
  orientation?: "auto" | "vertical";
};

/** CSS architecture pipeline — no Mermaid / no JS charting. */
export function FlowPipeline({
  title,
  caption,
  steps,
  orientation = "auto",
}: Props) {
  const vertical = orientation === "vertical";

  return (
    <figure className="blog-diagram my-8 overflow-hidden border border-line bg-bg-panel">
      {title ? (
        <figcaption className="border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted">
          {title}
        </figcaption>
      ) : null}
      <ol
        className={
          vertical
            ? "flex flex-col gap-0 divide-y divide-line"
            : "flex flex-col gap-0 sm:flex-row sm:divide-x sm:divide-y-0 divide-y divide-line"
        }
        aria-label={title ?? "Pipeline"}
      >
        {steps.map((step, i) => (
          <li
            key={`${step.label}-${i}`}
            className="relative flex min-w-0 flex-1 flex-col gap-1 px-4 py-4 sm:px-5"
          >
            <span className="font-mono text-[10px] tabular-nums text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="font-display text-sm font-semibold tracking-tight text-ink sm:text-base">
              {step.label}
            </p>
            {step.detail ? (
              <p className="text-xs leading-relaxed text-muted">{step.detail}</p>
            ) : null}
            {!vertical && i < steps.length - 1 ? (
              <span
                className="pointer-events-none absolute top-1/2 right-0 z-10 hidden -translate-y-1/2 translate-x-1/2 font-mono text-accent sm:block"
                aria-hidden
              >
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {caption ? (
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}
