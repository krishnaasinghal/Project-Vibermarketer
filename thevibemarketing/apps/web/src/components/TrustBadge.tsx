type Props = {
  confidence: number;
  contradiction?: boolean;
  label?: string;
  size?: "sm" | "md";
  /** Open agent trace (judge beat: Trust → evidence step). */
  onInspect?: () => void;
};

export function TrustBadge({
  confidence,
  contradiction = false,
  label,
  size = "sm",
  onInspect,
}: Props) {
  const pct = Number.isFinite(confidence)
    ? Math.round(confidence * 100)
    : 0;
  const titleParts = [
    `Diligence · confidence ${pct}% — evidence support for this claim`,
  ];
  if (contradiction) {
    titleParts.push(
      "Contradiction flagged in Diligence: sources disagree on key signals",
    );
  }
  if (label) {
    titleParts.push(label);
  }
  if (onInspect) {
    titleParts.push("Click to open Diligence / agent trace");
  }
  const title = titleParts.join(". ");

  const tone = contradiction
    ? "border-danger/50 text-danger"
    : pct >= 70
      ? "border-ok/50 text-ok"
      : pct >= 45
        ? "border-warn/50 text-warn"
        : "border-line text-muted";

  const className = `inline-flex items-center gap-1.5 border font-mono uppercase tracking-wider ${tone} ${
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
  } ${onInspect ? "cursor-pointer hover:bg-bg-elevated focus-ring" : ""}`;

  const body = (
    <>
      {contradiction ? "!" : "◆"} diligence {pct}%
      {label ? (
        <span className="normal-case tracking-normal">· {label}</span>
      ) : null}
    </>
  );

  if (onInspect) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        onClick={onInspect}
      >
        {body}
      </button>
    );
  }

  return (
    <span className={className} title={title}>
      {body}
    </span>
  );
}
