"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { BrandContext } from "@/lib/marketing-store";
import { readJsonSafe } from "@/lib/safe-json";
import { normalizeHttpUrl } from "@/lib/url";

type Scorecard = {
  url: string;
  ok: boolean;
  scores: {
    overall: number;
    seo: number;
    geo: number;
    performance: number;
    a11y: number;
    security: number;
  };
  lighthouse_style: {
    performance: number;
    accessibility: number;
    best_practices: number;
    seo: number;
    note: string;
  };
  recommendations: string[];
  checks: Array<{ id: string; label: string; pass: boolean; category: string }>;
};

type Phase = "idle" | "branding" | "drafting" | "ready";

const ONBOARDING_STEPS = [
  { id: "branding", label: "Analyze site" },
  { id: "memory", label: "Save brand memory" },
  { id: "drafting", label: "Draft channels" },
] as const;

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? "bg-ok" : value >= 50 ? "bg-accent" : "bg-danger";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-ink">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [brand, setBrand] = useState<BrandContext | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [saving, setSaving] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [auditNote, setAuditNote] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [productUrl, setProductUrl] = useState("");

  async function runAudit(url?: string) {
    setAuditBusy(true);
    setAuditNote(null);
    try {
      const res = await fetch("/api/marketing/site-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(url ? { url } : {}),
      });
      const data = (await res.json()) as {
        error?: string;
        scorecard?: Scorecard;
      };
      if (!res.ok || !data.scorecard) {
        setAuditNote(
          data.error || "Live site audit is unavailable. Retry when the target site is reachable.",
        );
        return;
      }
      setScorecard(data.scorecard);
    } catch (cause) {
      setAuditNote(
        cause instanceof Error
          ? cause.message
          : "Live site audit is unavailable. Retry when the target site is reachable.",
      );
    } finally {
      setAuditBusy(false);
    }
  }

  async function autoDraft() {
    setPhase("drafting");
    setDraftNote(null);
    try {
      const res = await fetch("/api/marketing/draft", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        source?: string;
        posts?: unknown[];
        auto_queued?: number;
      };
      if (!res.ok) {
        throw new Error(data.error || "Draft generation failed");
      }
      const n = Array.isArray(data.posts) ? data.posts.length : 0;
      if (n === 0) {
        throw new Error("Live draft generation returned no drafts");
      }
      setDraftCount(n);
      const aq = data.auto_queued ?? 0;
      setDraftNote(
        aq > 0
          ? `On-brand drafts ready (${data.source ?? "model"}). ${aq} low-risk auto-queued (L2) — not published. You still control the rest.`
          : `On-brand drafts ready (${data.source ?? "model"}). Nothing published — approve in the queue.`,
      );
    } catch (e) {
      setDraftCount(0);
      setDraftNote(
        e instanceof Error
          ? `${e.message} — open Studio to retry drafts.`
          : "Drafts failed — open Studio to retry.",
      );
    } finally {
      setPhase("ready");
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNote(null);
    setDraftCount(0);
    setDraftNote(null);
    setScorecard(null);
    setAuditNote(null);
    setPhase("branding");
    const url = normalizeHttpUrl(productUrl);
    if (!url) {
      setError("Enter a valid URL (e.g. yourproduct.in or https://…)");
      setSaving(false);
      setPhase("idle");
      return;
    }
    try {
      const scrapeRes = await fetch("/api/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const scrape = await readJsonSafe<{
        brand?: BrandContext;
        note?: string;
        error?: string;
      }>(scrapeRes);
      if (scrapeRes.ok && scrape.data?.brand) {
        setBrand(scrape.data.brand);
        setNote(scrape.data.note ?? "Brand memory saved.");
        // Parallel: scorecard (background) + first drafts (wow path)
        void runAudit(url);
        setSaving(false);
        await autoDraft();
        return;
      }
      throw new Error(scrape.data?.error || "Live brand extraction failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setPhase("idle");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || phase === "branding" || phase === "drafting";

  return (
    <div>
      <p className="section-label mb-2">Marketing fleet</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Onboarding
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Paste your product URL. We build brand memory, draft three channel posts,
        and drop them in your HITL queue — value in under a minute.
      </p>

      {!brand ? (
        <form onSubmit={onSubmit} className="mt-8 max-w-lg space-y-4">
          <div>
            <label htmlFor="url" className="mb-1 block text-sm text-muted">
              Product URL
            </label>
            <input
              id="url"
              type="text"
              inputMode="url"
              required
              disabled={busy}
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              className="input-field focus-ring"
              placeholder="https://yourproduct.com or yourstartup.in"
            />
            <p className="mt-1 text-xs text-muted">
              Public homepage. Firecrawl + model extract + SuperMemory required
              for live brand memory.
            </p>
          </div>
          <button type="submit" className="btn-primary focus-ring" disabled={busy}>
            {phase === "branding"
              ? "Building brand memory…"
              : phase === "drafting"
                ? "Drafting first posts…"
                : saving
                  ? "Working…"
                  : "Start — show me value in 60s"}
          </button>
        </form>
      ) : null}

      {phase !== "idle" ? (
        <ol
          className="mt-6 grid max-w-lg grid-cols-3 border border-line"
          aria-label="Onboarding progress"
        >
          {ONBOARDING_STEPS.map((step, index) => {
            const complete =
              step.id === "branding"
                ? Boolean(brand)
                : step.id === "memory"
                  ? Boolean(brand)
                  : phase === "ready" && draftCount > 0;
            const active =
              (step.id === "branding" && phase === "branding") ||
              (step.id === "drafting" && phase === "drafting");
            const failed =
              (step.id === "branding" && Boolean(error)) ||
              (step.id === "drafting" &&
                phase === "ready" &&
                draftCount === 0);
            return (
              <li
                key={step.id}
                className={`min-w-0 border-r border-line px-3 py-3 last:border-r-0 ${
                  complete
                    ? "bg-ok/10 text-ok"
                    : failed
                      ? "bg-danger/10 text-danger"
                      : active
                        ? "bg-accent/10 text-accent"
                        : "text-muted"
                }`}
              >
                <span className="block font-mono text-[9px] uppercase tracking-widest">
                  {complete ? "Complete" : failed ? "Needs retry" : active ? "Working" : `Step ${index + 1}`}
                </span>
                <span className="mt-1 block text-xs font-medium text-ink">
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {phase === "drafting" && brand ? (
        <div className="panel mt-8 max-w-lg border-accent/40 p-4" role="status">
          <p className="section-label mb-2 text-accent">Almost there</p>
          <p className="font-display text-lg font-semibold">{brand.name}</p>
          <p className="mt-2 text-sm text-muted">
            Brand locked. Writing X · LinkedIn · Reddit drafts in your voice…
          </p>
          <p className="mt-3 font-mono text-[11px] text-muted">
            Nothing publishes without your approve.
          </p>
        </div>
      ) : null}

      {brand && phase === "ready" ? (
        <div className="panel mt-8 max-w-lg border-ok/40 p-5">
          <p className="section-label mb-2 text-ok">Ready in under a minute</p>
          <p className="font-display text-xl font-semibold">{brand.name}</p>
          <p className="mt-2 text-sm text-muted">{brand.oneliner}</p>
          <p className="mt-3 text-xs text-muted">ICP: {brand.icp}</p>
          <p className="mt-1 text-xs text-muted">Tone: {brand.tone}</p>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {brand.pillars.map((p) => (
              <li key={p}>· {p}</li>
            ))}
          </ul>

          {note ? (
            <p className="mt-3 text-xs text-ok" role="status">
              {note}
            </p>
          ) : null}
          {draftNote ? (
            <p className="mt-2 text-sm text-ink" role="status">
              {draftCount > 0
                ? `${draftCount} draft${draftCount === 1 ? "" : "s"} in HITL queue. `
                : ""}
              {draftNote}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {draftCount > 0 ? (
              <Link
                href="/app/queue?wow=1"
                className="btn-primary focus-ring inline-flex justify-center !px-4 !py-2 text-sm"
              >
                See first drafts → approve
              </Link>
            ) : (
              <button
                type="button"
                className="btn-primary focus-ring inline-flex justify-center !px-4 !py-2 text-sm"
                onClick={() => void autoDraft()}
                disabled={busy}
              >
                Retry first drafts
              </button>
            )}
          </div>
          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted hover:text-ink">
              Optional next steps
            </summary>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <Link href="/app/connectors" className="text-accent hover:underline">
                Connect channels
              </Link>
              <Link href="/app/memory" className="text-accent hover:underline">
                Review brand memory
              </Link>
              <Link href="/app/cmo?wow=1" className="text-accent hover:underline">
                Open CMO desk
              </Link>
              <button
                type="button"
                className="text-accent hover:underline disabled:opacity-50"
                disabled={auditBusy}
                onClick={() => void runAudit(brand.url)}
              >
                {auditBusy ? "Auditing…" : "Re-run GEO scorecard"}
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Free plan: brand → drafts → HITL approval. Monthly run meter
              applies (25 free). Advanced workflows are available on{" "}
              <Link href="/pricing" className="text-accent hover:underline">
                Starter / Growth
              </Link>
              .
            </p>
          </details>
          {auditNote ? (
            <p className="mt-2 text-[11px] text-warn" role="status">
              Site audit: {auditNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {scorecard ? (
        <div className="panel mt-6 max-w-lg p-4">
          <p className="section-label mb-1">GEO + site health</p>
          <p className="font-display text-2xl font-bold text-ink">
            {scorecard.scores.overall}
            <span className="ml-2 text-sm font-normal text-muted">
              overall
            </span>
          </p>
          <p className="mt-1 text-[10px] text-muted">
            {scorecard.lighthouse_style.note}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ScoreBar label="SEO" value={scorecard.scores.seo} />
            <ScoreBar label="GEO / AEO" value={scorecard.scores.geo} />
            <ScoreBar
              label="Performance*"
              value={scorecard.lighthouse_style.performance}
            />
            <ScoreBar
              label="Accessibility*"
              value={scorecard.lighthouse_style.accessibility}
            />
            <ScoreBar
              label="Best practices*"
              value={scorecard.lighthouse_style.best_practices}
            />
            <ScoreBar
              label="Lighthouse-style SEO*"
              value={scorecard.lighthouse_style.seo}
            />
          </div>
          <p className="mt-2 text-[10px] text-muted">
            * Heuristic buckets (not Chrome Lighthouse CI lab data).
          </p>
          {scorecard.recommendations.length > 0 ? (
            <div className="mt-4">
              <p className="section-label mb-2">Top fixes</p>
              <ul className="space-y-1 text-xs text-muted">
                {scorecard.recommendations.slice(0, 6).map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ok">Strong baseline — keep shipping.</p>
          )}
          <div className="mt-3 max-h-40 overflow-y-auto font-mono text-[10px] text-muted">
            {scorecard.checks.map((c) => (
              <div key={c.id}>
                {c.pass ? "✓" : "✗"} [{c.category}] {c.label}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
