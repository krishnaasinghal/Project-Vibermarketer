"use client";

import { useEffect, useState } from "react";

type Props = {
  value: number;
  max?: number;
  label?: string;
  tone?: "accent" | "ok" | "warn" | "danger" | "cool";
  showValue?: boolean;
  /** Count-up animation on mount / value change */
  animate?: boolean;
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  cool: "bg-cool",
};

export function ScoreBar({
  value,
  max = 100,
  label,
  tone = "accent",
  showValue = true,
  animate = true,
}: Props) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!animate) {
      setDisplay(value);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    setDisplay(0);
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);

  const safeDisplay = Number.isFinite(display) ? display : 0;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const pct = Math.max(0, Math.min(100, (safeDisplay / safeMax) * 100));
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label ? <span className="text-xs text-muted">{label}</span> : <span />}
          {showValue ? (
            <span className="font-mono text-xs text-ink tabular-nums">
              {safeDisplay.toFixed(0)}
            </span>
          ) : null}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden bg-line"
        role="meter"
        aria-valuenow={Math.round(safeDisplay)}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label ?? "Score"}
      >
        <div className={`h-full ${toneClass[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
