"use client";

import Link from "next/link";
import { ScoreBar } from "@/components/ScoreBar";

export type CompareSide = {
  id: string;
  name: string;
  badge: string;
  product?: string;
  founder_score: number;
  gravity: number;
  audience: number;
  engagement: number;
  velocity: number;
  pull: number;
  followers: number;
  note: string;
  /** Independent axes — never averaged */
  axes?: {
    founder: number;
    market: number;
    idea: number;
    market_stance?: string;
  } | null;
  thesis_fit?: string;
  claim_contradictions?: number;
  memo_decision?: string | null;
  memo_decision_conf?: number | null;
  funnel_clock?: string;
  within_24h?: boolean;
  cold_start?: boolean;
};

type Props = {
  left: CompareSide;
  right: CompareSide;
  thesis?: string;
};

function BigNum({ value, label, win }: { value: number; label: string; win?: boolean }) {
  return (
    <div>
      <p
        className={`font-display text-5xl font-bold tracking-tight tabular-nums sm:text-6xl ${
          win ? "text-accent" : "text-ink/80"
        }`}
      >
        {Number.isFinite(value) ? Math.round(value) : "—"}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
    </div>
  );
}

function AxisRow({
  label,
  left,
  right,
}: {
  label: string;
  left: number;
  right: number;
}) {
  const lWin = left > right;
  const rWin = right > left;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-xs tabular-nums">
      <span className={lWin ? "text-accent" : "text-muted"}>
        {Number.isFinite(left) ? left.toFixed(0) : "—"}
      </span>
      <span className="text-center text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className={`text-right ${rWin ? "text-accent" : "text-muted"}`}>
        {Number.isFinite(right) ? right.toFixed(0) : "—"}
      </span>
    </div>
  );
}

function Side({
  side,
  winsGravity,
}: {
  side: CompareSide;
  winsGravity: boolean;
}) {
  const decision = side.memo_decision?.toUpperCase();
  return (
    <div
      className={`relative flex flex-col border p-5 sm:p-6 ${
        winsGravity
          ? "border-accent/50 bg-accent/[0.04]"
          : "border-line bg-bg-panel"
      }`}
    >
      {winsGravity ? (
        <span className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-wider text-accent">
          wins gravity
        </span>
      ) : null}
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {side.badge}
        {side.cold_start ? " · cold-start" : ""}
      </p>
      <h3 className="mt-2 font-display text-2xl font-bold">{side.name}</h3>
      {side.product ? (
        <p className="mt-1 text-sm text-muted">{side.product}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
        {side.thesis_fit ? (
          <span className="border border-line px-1.5 py-0.5 text-muted">
            thesis {side.thesis_fit}
          </span>
        ) : null}
        {decision ? (
          <span
            className={`border px-1.5 py-0.5 ${
              decision === "YES"
                ? "border-ok/40 text-ok"
                : decision === "NO"
                  ? "border-danger/40 text-danger"
                  : "border-warn/40 text-warn"
            }`}
          >
            $100K {decision}
            {side.memo_decision_conf != null
              ? ` · ${Math.round(side.memo_decision_conf * 100)}%`
              : ""}
          </span>
        ) : (
          <span className="border border-line px-1.5 py-0.5 text-muted">
            no memo yet
          </span>
        )}
        {(side.claim_contradictions ?? 0) > 0 ? (
          <span className="border border-danger/40 px-1.5 py-0.5 text-danger">
            {side.claim_contradictions} Trust contradiction
            {(side.claim_contradictions ?? 0) > 1 ? "s" : ""}
          </span>
        ) : null}
        {side.funnel_clock ? (
          <span
            className={side.within_24h ? "text-ok" : "text-warn"}
            title="24h decision-support SLA clock"
          >
            {side.funnel_clock}
          </span>
        ) : null}
      </div>
      <div className="mt-8">
        <BigNum value={side.gravity} label="Distribution gravity" win={winsGravity} />
      </div>
      <div className="mt-6 space-y-3">
        <ScoreBar
          value={side.founder_score}
          label="Founder Score"
          tone={winsGravity ? "accent" : "cool"}
        />
        <ScoreBar
          value={Math.min(100, side.velocity * 5)}
          label={`Velocity ${Number.isFinite(side.velocity) ? side.velocity.toFixed(1) : "—"}`}
          tone="ok"
          showValue={false}
        />
        <ScoreBar
          value={Math.min(100, side.pull)}
          label={`Pull ratio ${Number.isFinite(side.pull) ? side.pull.toFixed(1) : "—"}`}
          tone="warn"
          showValue={false}
        />
      </div>
      {side.axes ? (
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            3 axes · never averaged
          </p>
          <div className="space-y-1.5">
            <p className="font-mono text-xs tabular-nums">
              F {side.axes.founder.toFixed(0)} · M {side.axes.market.toFixed(0)}
              {side.axes.market_stance ? ` (${side.axes.market_stance})` : ""} · I{" "}
              {side.axes.idea.toFixed(0)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-6 font-mono text-[10px] uppercase text-muted">
          Axes — run screen to populate
        </p>
      )}
      <dl className="mt-6 grid grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <dt className="text-muted">Audience</dt>
          <dd className="text-lg text-ink">{side.audience.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted">Engagement</dt>
          <dd className="text-lg text-ink">{side.engagement.toLocaleString()}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-muted">{side.note}</p>
      <Link
        href={`/app/founders/${encodeURIComponent(side.id)}`}
        className="focus-ring mt-6 inline-block text-sm text-accent hover:underline"
      >
        Open profile →
      </Link>
    </div>
  );
}

export function GravityCompare({ left, right, thesis }: Props) {
  const leftWins = left.gravity >= right.gravity;
  const showAxes = Boolean(left.axes || right.axes);
  return (
    <div>
      {thesis ? (
        <p className="mb-6 max-w-2xl font-display text-xl font-semibold leading-snug text-ink sm:text-2xl">
          {thesis}
        </p>
      ) : null}
      <div className="grid gap-0 md:grid-cols-2 md:gap-px md:bg-line">
        <Side side={left} winsGravity={leftWins} />
        <Side side={right} winsGravity={!leftWins} />
      </div>
      {showAxes ? (
        <div className="mt-6 border border-line bg-bg-panel p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">
            Axis disagreement · independent scores
          </p>
          <div className="space-y-2">
            <AxisRow
              label="Founder"
              left={left.axes?.founder ?? NaN}
              right={right.axes?.founder ?? NaN}
            />
            <AxisRow
              label="Market"
              left={left.axes?.market ?? NaN}
              right={right.axes?.market ?? NaN}
            />
            <AxisRow
              label="Idea"
              left={left.axes?.idea ?? NaN}
              right={right.axes?.idea ?? NaN}
            />
          </div>
        </div>
      ) : null}
      <p className="mt-6 font-mono text-xs text-muted">
        Pedigree ≠ distribution gravity. Cold-start founders with earned attention
        rank fairly — Area of Research #3 in the brief. Axes are never averaged.
      </p>
    </div>
  );
}
