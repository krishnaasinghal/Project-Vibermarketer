"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Memo, Screening } from "@vibe/engine";
import { AxisPanel } from "@/components/AxisPanel";
import { ScreeningTheater } from "@/components/ScreeningTheater";
import { TraceDrawer } from "@/components/TraceDrawer";
import { TrustBadge } from "@/components/TrustBadge";
import {
  formatDecisionSummary,
  formatMemoHtml,
  formatMemoMarkdown,
  slugifyFounder,
  type MemoExportInput,
} from "@/lib/memo-export";

export default function MemoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [memo, setMemo] = useState<Memo | null>(null);
  const [screening, setScreening] = useState<Screening | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [theaterDone, setTheaterDone] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [slam, setSlam] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [traceOpenSignal, setTraceOpenSignal] = useState(0);
  const [traceFocus, setTraceFocus] = useState<string | null>(null);
  const [funnelClock, setFunnelClock] = useState<string | null>(null);
  const [within24h, setWithin24h] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const detail = await fetch(`/api/founders/${encodeURIComponent(id)}`);
    if (detail.ok) {
      const d = (await detail.json()) as {
        founder: { name: string; id?: string };
        memo?: Memo | null;
        screening?: Screening | null;
        funnel_clock?: string;
        within_24h?: boolean;
        canonical_id?: string;
      };
      setName(d.founder.name);
      if (d.memo) setMemo(d.memo);
      if (d.screening) setScreening(d.screening);
      setFunnelClock(d.funnel_clock ?? null);
      setWithin24h(d.within_24h ?? null);
      const canonical = d.canonical_id ?? d.founder.id;
      if (canonical && canonical !== id) {
        router.replace(
          `/app/founders/${encodeURIComponent(canonical)}/memo`,
        );
        return;
      }
    }
    const res = await fetch(`/api/memo/${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = (await res.json()) as { memo: Memo };
      setMemo(data.memo);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/traces/latest/${id}`);
      if (!res.ok) return;
      const body = (await res.json()) as { run_id?: string | null };
      if (body.run_id) setRunId(body.run_id);
    })();
  }, [id]);

  const axisDisagreement = useMemo(() => {
    if (!screening) return null;
    const f = screening.founder_axis.score;
    const m = screening.market_axis.score;
    const delta = Math.abs(f - m);
    if (delta < 12) return null;
    const higher = f > m ? "Founder" : "Market";
    const lower = f > m ? "Market" : "Founder";
    return {
      delta: Math.round(delta),
      higher,
      lower,
      f: Math.round(f),
      m: Math.round(m),
      fLabel: screening.founder_axis.label,
      mLabel: screening.market_axis.label,
    };
  }, [screening]);

  function inspectTrust() {
    setTraceFocus("trust_claims");
    setTraceOpenSignal((n) => n + 1);
    document.getElementById("agent-trace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  useEffect(() => {
    if (memo?.decision === "no") {
      const t = window.setTimeout(() => setSlam(true), 80);
      return () => window.clearTimeout(t);
    }
    setSlam(false);
  }, [memo?.decision, memo?.id]);

  async function generate() {
    setBusy(true);
    setTheaterDone(false);
    setSlam(false);
    setError(null);
    try {
      const res = await fetch(`/api/memo/${id}`, { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        memo?: Memo;
        screening?: Screening;
        run_id?: string;
      };
      if (!res.ok) throw new Error(body.error || "Memo failed");
      if (body.memo) setMemo(body.memo);
      if (body.screening) setScreening(body.screening);
      setRunId(body.run_id ?? null);
      setTheaterDone(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Memo failed");
    } finally {
      setBusy(false);
    }
  }

  const decisionTone =
    memo?.decision === "yes"
      ? "text-ok border-ok/40"
      : memo?.decision === "no"
        ? "text-danger border-danger/40"
        : "text-warn border-warn/40";

  function exportInput(): MemoExportInput | null {
    if (!memo) return null;
    return {
      founderName: name || "Founder",
      memo,
      screening,
      funnelClock,
      siteUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
    };
  }

  function flashNote(msg: string) {
    setCopyNote(msg);
    window.setTimeout(() => setCopyNote(null), 2500);
  }

  async function copyText(text: string, okMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flashNote(okMsg);
    } catch {
      flashNote("Copy failed — try Download .md");
    }
  }

  async function copyDecisionSummary() {
    const input = exportInput();
    if (!input) return;
    await copyText(formatDecisionSummary(input), "Decision summary copied");
  }

  async function copyFullMemo() {
    const input = exportInput();
    if (!input) return;
    await copyText(formatMemoMarkdown(input), "Full memo copied");
  }

  function downloadMarkdown() {
    const input = exportInput();
    if (!input) return;
    const md = formatMemoMarkdown(input);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memo-${slugifyFounder(input.founderName)}-${input.memo.decision}.md`;
    a.click();
    URL.revokeObjectURL(url);
    flashNote("Markdown downloaded");
  }

  function exportPdf() {
    const input = exportInput();
    if (!input) return;
    const html = formatMemoHtml(input);
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
    if (!w) {
      flashNote("Pop-up blocked — allow pop-ups to export PDF");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    flashNote("Print dialog → Save as PDF");
  }

  return (
    <div>
      <Link
        href={`/app/founders/${encodeURIComponent(id)}`}
        className="text-sm text-muted hover:text-accent"
        suppressHydrationWarning
      >
        ← <span suppressHydrationWarning>{name || "Founder"}</span>
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-label mb-2">Investment memo</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Evidence-backed memo
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {memo ? (
            <>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={() => void copyDecisionSummary()}
              >
                Copy decision
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={() => void copyFullMemo()}
              >
                Copy full memo
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={downloadMarkdown}
              >
                Download .md
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={exportPdf}
              >
                Export PDF
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void generate()}
            disabled={busy}
          >
            {busy ? "Generating…" : memo ? "Regenerate memo" : "Generate memo"}
          </button>
        </div>
      </div>

      {copyNote ? (
        <p className="mt-3 font-mono text-xs text-accent" role="status">
          {copyNote}
        </p>
      ) : null}

      <ScreeningTheater
        active={busy}
        complete={theaterDone && !busy}
        founderId={id}
      />

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {!memo ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="font-display text-lg font-semibold">No memo yet</p>
          <p className="mt-2 text-sm text-muted">
            Generate to run screening + trust + $100K decision.
          </p>
          <button
            type="button"
            className="btn-primary focus-ring mt-6 !px-3 !py-1.5 text-sm"
            onClick={() => void generate()}
            disabled={busy}
          >
            {busy ? "Generating…" : "Generate memo"}
          </button>
        </div>
      ) : (
        <>
          <div
            className={`panel mt-8 border p-6 ${decisionTone} ${
              slam && memo.decision === "no" ? "decision-slam" : ""
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="section-label">$100K decision-support</p>
              {funnelClock ? (
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider ${
                    within24h ? "text-ok" : "text-warn"
                  }`}
                  title="24h SLA — time since first Memory write"
                >
                  {funnelClock}
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-display text-5xl font-bold uppercase tracking-tight tabular-nums sm:text-6xl">
              {memo.decision}
            </p>
            <p className="mt-2 text-sm tabular-nums opacity-90">
              Confidence {(memo.decision_conf * 100).toFixed(0)}%
            </p>
            <p className="mt-3 max-w-xl text-xs opacity-80">
              Decision-support for a human investor — not an investment offer or
              automated wire. Gaps below are honest unknowns, not invented
              numbers.
            </p>
          </div>

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold">
              Gaps · due diligence first
            </h2>
            <p className="mt-1 text-xs text-muted">
              Judges care what we refuse to invent. Cap table / financials stay
              “not disclosed” until evidence lands.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {memo.gaps.map((g) => (
                <li key={g}>· {g}</li>
              ))}
            </ul>
            {memo.sections
              .filter((s) => s.key === "due_diligence_log")
              .map((s) => (
                <article key={s.key} className="panel mt-4 border-accent/30 p-4">
                  <h3 className="font-display font-semibold">{s.title}</h3>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
                    {s.body}
                  </pre>
                </article>
              ))}
          </section>

          {screening ? (
            <section className="mt-8">
              <h2 className="font-display text-lg font-semibold">
                Three axes — not averaged
              </h2>
              <p className="mt-1 text-sm text-muted">
                Independent Founder / Market / Idea scores feed the decision —
                disagreement is the signal, not a bug.
              </p>
              {axisDisagreement ? (
                <div
                  className="panel mt-3 border-warn/40 bg-warn/5 p-3"
                  role="status"
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-warn">
                    Axes disagree
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {axisDisagreement.higher} ({axisDisagreement.higher === "Founder" ? axisDisagreement.f : axisDisagreement.m})
                    {" vs "}
                    {axisDisagreement.lower} ({axisDisagreement.lower === "Founder" ? axisDisagreement.f : axisDisagreement.m})
                    {" — Δ "}
                    {axisDisagreement.delta}. Labels: Founder{" "}
                    <span className="text-accent">{axisDisagreement.fLabel}</span>
                    {" · Market "}
                    <span className="text-accent">{axisDisagreement.mLabel}</span>
                    . Never collapsed into one score.
                  </p>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <AxisPanel
                  title="Founder"
                  axis={screening.founder_axis}
                  description="Who they are + Founder Score as one input"
                />
                <AxisPanel
                  title="Market"
                  axis={screening.market_axis}
                  description="Bullish / neutral / bear — independent"
                />
                <AxisPanel
                  title="Idea vs Market"
                  axis={screening.idea_axis}
                  description="Survives as-is or team must pivot"
                />
              </div>
            </section>
          ) : null}

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold">
              Diligence · Trust claims
            </h2>
            <p className="mt-1 text-xs text-muted">
              Click a Trust badge to open the agent trace step that pulled the
              evidence.
            </p>
            <ul className="mt-3 space-y-2">
              {memo.claims.map((c, i) => (
                <li
                  key={`${c.text}-${i}`}
                  className={`panel p-3 ${
                    c.contradiction ? "claim-flash border-danger/50" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm">{c.text}</p>
                    <TrustBadge
                      confidence={c.confidence}
                      contradiction={c.contradiction}
                      onInspect={runId ? inspectTrust : undefined}
                    />
                  </div>
                  {c.evidence_url ? (
                    <a
                      href={c.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block break-all text-xs text-accent hover:underline"
                    >
                      {c.evidence_url}
                    </a>
                  ) : null}
                  {c.contradiction && c.contradiction_note ? (
                    <p className="mt-2 text-xs text-danger">{c.contradiction_note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="font-display text-lg font-semibold">
              Appendix sections
            </h2>
            {memo.sections
              .filter((s) => s.key !== "due_diligence_log")
              .map((s) => (
                <article key={s.key} className="panel p-4">
                  <h3 className="font-display font-semibold">
                    {s.title}
                    {s.required ? (
                      <span className="ml-2 font-mono text-[10px] text-muted">
                        required
                      </span>
                    ) : null}
                  </h3>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
                    {s.body}
                  </pre>
                </article>
              ))}
          </section>
        </>
      )}

      <div className="mt-8">
        <TraceDrawer
          runId={runId}
          autoOpen={theaterDone}
          openSignal={traceOpenSignal}
          focusStep={traceFocus}
        />
      </div>
    </div>
  );
}
