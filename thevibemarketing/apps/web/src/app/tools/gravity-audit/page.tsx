"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MarketingPageHero, MarketingSection } from "@/components/MarketingPage";
import { ScoreBar } from "@/components/ScoreBar";

type AuditResult = {
  ok: boolean;
  disclaimer?: string;
  source?: string;
  gravity_score?: number;
  confidence?: number;
  abstain?: boolean;
  abstain_reason?: string | null;
  components?: {
    velocity: number;
    pull_ratio: number;
    cadence: number;
    stars: number;
    forks: number;
    hn_points: number;
    followers: number;
    engagement: number;
  };
  evidence?: string[];
  enrichment?: { github_token?: boolean; steps?: string[] };
  error?: string;
  hint?: string;
};

export default function GravityAuditPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runAudit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/tools/gravity-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: input.trim() }),
        });
        const { readJsonSafe } = await import("@/lib/safe-json");
        const { data } = await readJsonSafe<AuditResult>(res);
        if (!res.ok || data?.error || !data) {
          setResult(null);
          setError(
            [data?.error, data?.hint].filter(Boolean).join(" — ") ||
              `Request failed (${res.status})`,
          );
          return;
        }
        setResult(data);
      } catch (cause) {
        setResult(null);
        setError(cause instanceof Error ? cause.message : "Audit failed");
      }
    });
  }

  return (
    <>
      <MarketingPageHero
        narrow
        label="Free tool · live data"
        title="Distribution Gravity Audit"
        lead={
          <>
            Enter a GitHub username, <span className="text-ink">owner/repo</span>,
            or GitHub URL. We verify public GitHub data live and score it with the
            same deterministic gravity math as VC Brain.
          </>
        }
        actions={<Link href="/vc-brain" className="btn-ghost focus-ring text-base">See VC Brain</Link>}
      >
        <p className="border-l-2 border-accent/50 pl-3 text-sm text-muted">
          Not investment advice. Scores use live GitHub API metrics only—no manual,
          scraped, inferred, or LLM-generated numbers.
        </p>
      </MarketingPageHero>

      <MarketingSection flush>
        <form
          className="panel max-w-2xl space-y-5 p-6 sm:p-7"
          onSubmit={(event) => { event.preventDefault(); runAudit(); }}
        >
          <div>
            <label htmlFor="audit-input" className="section-label mb-2 block">GitHub target</label>
            <textarea
              id="audit-input"
              className="input-field min-h-[110px] font-mono text-sm"
              placeholder="octocat\noctocat/Hello-World\nhttps://github.com/octocat/Hello-World"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <p className="mt-2 text-xs text-muted">
              Use an exact GitHub username, owner/repo, or GitHub URL. A score is unavailable until GitHub verifies it.
            </p>
          </div>
          <button type="submit" className="btn-primary focus-ring" disabled={pending}>
            {pending ? "Verifying…" : "Run live audit"}
          </button>
        </form>

        {error ? <div className="panel mt-6 max-w-2xl border-danger/40 p-4 text-sm text-danger" role="alert">{error}</div> : null}

        {result?.ok && result.gravity_score != null ? (
          <div className="mt-10 max-w-2xl space-y-6">
            <div className="panel p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="section-label">Gravity score</p>
                <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{result.source ?? "github_live"}</span>
              </div>
              <p className="mt-2 font-display text-5xl font-bold tracking-tight text-accent tabular-nums">
                {result.gravity_score.toFixed(0)}<span className="text-2xl text-muted">/100</span>
              </p>
              <div className="mt-4"><ScoreBar value={result.gravity_score} label="Distribution gravity" tone={result.abstain ? "warn" : "accent"} /></div>
              <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                Confidence {(Number(result.confidence ?? 0) * 100).toFixed(0)}%
                {result.abstain ? ` · abstain${result.abstain_reason ? `: ${result.abstain_reason}` : ""}` : ""}
              </p>
              {result.disclaimer ? <p className="mt-3 text-xs text-muted/80">{result.disclaimer}</p> : null}
            </div>

            {result.components ? (
              <div className="panel p-6">
                <p className="section-label mb-4">Live GitHub components</p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  <li><ScoreBar value={Math.min(100, result.components.velocity * 20)} label={`Velocity ${result.components.velocity.toFixed(2)}`} tone="cool" showValue={false} /></li>
                  <li><ScoreBar value={Math.min(100, result.components.pull_ratio * 10)} label={`Pull ratio ${result.components.pull_ratio.toFixed(2)}`} tone="cool" showValue={false} /></li>
                  <li><ScoreBar value={result.components.cadence * 100} label={`Cadence ${(result.components.cadence * 100).toFixed(0)}%`} tone="ok" /></li>
                  <li className="font-mono text-xs text-muted sm:col-span-2">stars {result.components.stars} · forks {result.components.forks} · followers {result.components.followers} · engagement {result.components.engagement}</li>
                </ul>
              </div>
            ) : null}

            {result.enrichment ? <div className="panel p-6"><p className="section-label mb-3">Verification</p><p className="font-mono text-[11px] text-muted">GITHUB_TOKEN {result.enrichment.github_token ? "on" : "off"}</p>{result.enrichment.steps?.length ? <ol className="mt-3 list-decimal space-y-1 pl-5 font-mono text-[11px] text-muted">{result.enrichment.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}</div> : null}
            {result.evidence?.length ? <div className="panel p-6"><p className="section-label mb-3">Evidence</p><ul className="list-disc space-y-1.5 pl-5 break-words text-sm text-muted">{result.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
          </div>
        ) : null}
      </MarketingSection>
    </>
  );
}
