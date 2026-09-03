"use client";

import { useEffect, useState } from "react";
import type { TraceStep } from "@vibe/engine";
import { PIPELINE_STEPS } from "@/content/pipeline-steps";
import { readJsonSafe } from "@/lib/safe-json";

type Props = {
  runId: string | null;
  steps?: TraceStep[];
  /** Auto-open and load when runId appears */
  autoOpen?: boolean;
  /** Increment to force-open (e.g. Trust badge click). */
  openSignal?: number;
  /** Scroll/highlight this pipeline step id when opening. */
  focusStep?: string | null;
};

function humanLabel(step: string): string {
  const hit = PIPELINE_STEPS.find((p) => p.id === step || step.includes(p.id));
  return hit?.label ?? step.replace(/_/g, " ");
}

export function TraceDrawer({
  runId,
  steps = [],
  autoOpen = false,
  openSignal = 0,
  focusStep = null,
}: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [loaded, setLoaded] = useState<TraceStep[]>(steps);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!runId) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/traces/${runId}`);
      const { data } = await readJsonSafe<{
        steps?: TraceStep[];
        traces?: TraceStep[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data?.error || "Trace not found");
      setLoaded(data?.steps ?? data?.traces ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoOpen && runId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, runId]);

  useEffect(() => {
    if (openSignal > 0 && runId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  useEffect(() => {
    if (!open || !focusStep || loaded.length === 0) return;
    const el = document.getElementById(`trace-step-${focusStep}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open, focusStep, loaded]);

  if (!runId) return null;

  return (
    <div id="agent-trace" className="border-t border-line pt-4">
      <button
        type="button"
        className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
        onClick={() => (open ? setOpen(false) : void load())}
        aria-expanded={open}
      >
        {open ? "Hide agent trace" : "Show agent trace"}
      </button>
      {open ? (
        <div className="panel mt-3 p-3" role="region" aria-label="Agent trace">
          {loading ? (
            <p className="text-sm text-muted">Loading trace…</p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <ol className="space-y-3">
            {loaded.map((step, i) => {
              const evidence = Array.isArray(step.evidence)
                ? step.evidence.slice(0, 3)
                : [];
              const focused =
                focusStep &&
                (step.step === focusStep || step.step.includes(focusStep));
              return (
                <li
                  key={`${step.run_id}-${step.step}-${i}`}
                  id={`trace-step-${step.step}`}
                  className={`border-l-2 pl-3 ${
                    focused
                      ? "border-warn bg-warn/5"
                      : "border-accent/40"
                  }`}
                >
                  <p className="font-mono text-xs text-accent">
                    {String(i + 1).padStart(2, "0")} · {humanLabel(step.step)}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">
                    {step.step}
                    {step.ts ? ` · ${step.ts}` : ""}
                  </p>
                  {step.step === "agent_lanes" &&
                  step.output &&
                  typeof step.output === "object" &&
                  Array.isArray(
                    (step.output as { sandboxes?: unknown }).sandboxes,
                  ) &&
                  ((step.output as { sandboxes: Array<{ sandbox_id?: string }> })
                    .sandboxes?.length ?? 0) > 0 ? (
                    <p className="mt-1 font-mono text-[10px] text-ok">
                      E2B{" "}
                      {(
                        step.output as {
                          sandboxes: Array<{
                            role?: string;
                            sandbox_id?: string;
                          }>;
                        }
                      ).sandboxes
                        .map((s) => `${s.role ?? "?"}:${s.sandbox_id ?? "?"}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {evidence.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {evidence.map((e) => (
                        <li key={String(e)} className="min-w-0 break-all">
                          · {typeof e === "string" ? e : JSON.stringify(e)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <pre className="mt-2 max-h-24 overflow-auto font-mono text-[10px] text-muted">
                      {JSON.stringify(
                        { output: step.output },
                        null,
                        2,
                      ).slice(0, 400)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>
          {!loading && !error && loaded.length === 0 ? (
            <p className="text-sm text-muted">No steps recorded for this run.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
