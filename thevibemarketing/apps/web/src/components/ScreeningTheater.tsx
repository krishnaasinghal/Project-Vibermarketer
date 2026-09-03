"use client";

import { useEffect, useRef, useState } from "react";
import { PIPELINE_STEPS } from "@/content/pipeline-steps";
import { readJsonSafe } from "@/lib/safe-json";

type Props = {
  active: boolean;
  /** When true, snap all steps to done */
  complete?: boolean;
  /** Poll `/api/traces/latest/[founderId]` while screening */
  founderId?: string | null;
  onDoneVisual?: () => void;
};

/**
 * Pipeline progress — driven by real Memory traces for this founder.
 */
export function ScreeningTheater({
  active,
  complete,
  founderId,
  onDoneVisual,
}: Props) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const doneVisualFired = useRef(false);
  const onDoneRef = useRef(onDoneVisual);

  useEffect(() => {
    onDoneRef.current = onDoneVisual;
  }, [onDoneVisual]);

  useEffect(() => {
    if (!active && !complete) {
      setDoneIds(new Set());
      setLive(false);
      doneVisualFired.current = false;
      return;
    }
    if (complete) {
      setDoneIds(new Set(PIPELINE_STEPS.map((s) => s.id)));
      if (!doneVisualFired.current) {
        doneVisualFired.current = true;
        onDoneRef.current?.();
      }
      return;
    }
    if (!founderId) return;

    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(
          `/api/traces/latest/${encodeURIComponent(founderId)}`,
        );
        if (!res.ok || cancelled) return;
        const { data: body } = await readJsonSafe<{
          traces?: Array<{ step?: string }>;
        }>(res);
        const rows = body?.traces ?? [];
        if (rows.length === 0) return;
        const ids = new Set<string>();
        for (const row of rows) {
          if (row.step) ids.add(row.step);
        }
        if (!cancelled) {
          setDoneIds(ids);
          setLive(true);
        }
      } catch {
        /* ignore poll errors */
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 350);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, complete, founderId]);

  useEffect(() => {
    setDoneIds(new Set());
    setLive(false);
    doneVisualFired.current = false;
  }, [founderId]);

  if (!active && !complete) return null;

  const currentIdx = PIPELINE_STEPS.findIndex((s) => !doneIds.has(s.id));

  return (
    <div
      className="panel screening-theater mt-6 overflow-hidden border-accent/30 p-4"
      role="status"
      aria-live="polite"
      aria-label="Screening pipeline"
    >
      <p className="section-label mb-3">
        Agent pipeline{live || complete ? " · live traces" : " · waiting for live traces"}
      </p>
      <ol className="space-y-2">
        {PIPELINE_STEPS.map((step, i) => {
          const done = complete || doneIds.has(step.id);
          const current = !complete && !done && i === currentIdx;
          return (
            <li
              key={step.id}
              className={`flex items-center gap-3 font-mono text-xs transition-opacity ${
                done || current ? "opacity-100" : "opacity-35"
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] ${
                  done
                    ? "border-ok/50 bg-ok/15 text-ok"
                    : current
                      ? "border-accent/60 bg-accent/15 text-accent pulse-step"
                      : "border-line text-muted"
                }`}
              >
                {done ? "✓" : current ? "▸" : String(i + 1)}
              </span>
              <span
                className={
                  current ? "text-accent" : done ? "text-ink" : "text-muted"
                }
              >
                {step.label}
              </span>
              <span className="ml-auto text-[10px] text-muted">{step.id}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
