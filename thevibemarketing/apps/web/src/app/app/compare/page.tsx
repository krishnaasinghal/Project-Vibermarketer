"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Founder, Product } from "@vibe/engine";
import { GravityCompare, type CompareSide } from "@/components/GravityCompare";
import { emptyGravity } from "@/lib/normalize";
import { readJsonSafe } from "@/lib/safe-json";

type RadarRow = Founder & {
  product?: Product | null;
  screening?: {
    founder_axis: { score: number };
    market_axis: { score: number; stance?: string };
    idea_axis: { score: number };
  } | null;
  thesis_fit?: string;
  claim_contradictions?: number;
  memo_decision?: string | null;
  memo_decision_conf?: number | null;
  funnel_clock?: string;
  within_24h?: boolean;
  cold_start?: boolean;
  gravity_thin?: boolean;
  public_sources?: string[];
  signal_count?: number;
};

function toSide(founder: RadarRow): CompareSide {
  const g = founder.gravity?.components ? founder.gravity : emptyGravity();
  const sc = founder.screening;
  return {
    id: founder.id,
    name: founder.name,
    badge: founder.product?.sector ?? "founder",
    product: founder.product?.name
      ? `${founder.product.name}${founder.product.oneliner ? ` — ${founder.product.oneliner}` : ""}`
      : undefined,
    founder_score: Number.isFinite(founder.founder_score)
      ? founder.founder_score
      : 0,
    gravity: g.gravity_score,
    audience: g.components.audience,
    engagement: g.components.engagement,
    velocity: g.components.velocity,
    pull: g.components.pull_ratio,
    followers: g.components.followers,
    note:
      founder.bio?.slice(0, 160) ||
      "Live radar founder — scored from public signals.",
    axes: sc
      ? {
          founder: sc.founder_axis.score,
          market: sc.market_axis.score,
          idea: sc.idea_axis.score,
          market_stance: sc.market_axis.stance,
        }
      : null,
    thesis_fit: founder.thesis_fit,
    claim_contradictions: founder.claim_contradictions ?? 0,
    memo_decision: founder.memo_decision,
    memo_decision_conf: founder.memo_decision_conf,
    funnel_clock: founder.funnel_clock,
    within_24h: founder.within_24h,
    cold_start: Boolean(founder.cold_start),
  };
}

/** Prefer the pair with the largest gravity delta (inversion demo). */
function pickComparePair(ranked: RadarRow[]): [string, string] | null {
  if (ranked.length < 2) return null;
  let best: [string, string] | null = null;
  let bestDelta = -1;
  const n = Math.min(ranked.length, 12);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ranked[i]!;
      const b = ranked[j]!;
      const ga = a.gravity?.gravity_score ?? 0;
      const gb = b.gravity?.gravity_score ?? 0;
      const delta = Math.abs(ga - gb);
      const coldBoost =
        (a.cold_start && !b.cold_start) || (!a.cold_start && b.cold_start)
          ? 8
          : 0;
      const score = delta + coldBoost;
      if (score > bestDelta) {
        bestDelta = score;
        best = ga >= gb ? [a.id, b.id] : [b.id, a.id];
      }
    }
  }
  return best ?? [ranked[0]!.id, ranked[1]!.id];
}

export default function ComparePage() {
  const [pool, setPool] = useState<RadarRow[]>([]);
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const [githubHint, setGithubHint] = useState("");

  const load = useCallback(async (opts?: { keepSelection?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/founders?sort=gravity&limit=80", {
        credentials: "include",
      });
      const { data, parseError } = await readJsonSafe<{
        founders?: RadarRow[];
        error?: string;
      }>(res);
      if (res.status === 401) {
        throw new Error("Your session expired. Sign in again.");
      }
      if (!res.ok) {
        throw new Error(
          data?.error ||
            parseError ||
            `Could not load founders (${res.status})`,
        );
      }
      const ranked = [...(data?.founders ?? [])].sort(
        (a, b) =>
          (b.gravity?.gravity_score ?? 0) - (a.gravity?.gravity_score ?? 0) ||
          b.founder_score - a.founder_score,
      );
      setPool(ranked);
      if (ranked.length < 2) {
        setLeftId(null);
        setRightId(null);
        setError(
          ranked.length === 0
            ? "No founders yet. Run Identify on Radar (live GitHub/HN/arXiv) or Apply with a GitHub handle."
            : "Need at least two founders to compare. Identify more sources or invite another apply.",
        );
        return;
      }
      const pair = pickComparePair(ranked);
      setLeftId((prev) => {
        if (opts?.keepSelection && prev && ranked.some((f) => f.id === prev)) {
          return prev;
        }
        return pair?.[0] ?? ranked[0]!.id;
      });
      setRightId((prev) => {
        if (opts?.keepSelection && prev && ranked.some((f) => f.id === prev)) {
          return prev;
        }
        return pair?.[1] ?? ranked[1]!.id;
      });
    } catch (e) {
      setPool([]);
      setLeftId(null);
      setRightId(null);
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const left = pool.find((f) => f.id === leftId);
  const right = pool.find((f) => f.id === rightId);
  const bothThin =
    Boolean(left?.gravity_thin ?? (left && (left.gravity?.gravity_score ?? 0) < 15)) &&
    Boolean(right?.gravity_thin ?? (right && (right.gravity?.gravity_score ?? 0) < 15));

  async function enrichSides() {
    if (!leftId || !rightId || enriching) return;
    setEnriching(true);
    setEnrichNote("Pulling public GitHub / web signals…");
    const hint = githubHint.trim().replace(/^@/, "");
    try {
      const notes: string[] = [];
      for (const id of [leftId, rightId]) {
        const row = pool.find((f) => f.id === id);
        const attachGithub =
          hint && !row?.handles?.github ? hint : undefined;
        const res = await fetch(`/api/agents/enrich/${id}`, {
          method: "POST",
          credentials: "include",
          headers: attachGithub
            ? { "Content-Type": "application/json" }
            : undefined,
          body: attachGithub
            ? JSON.stringify({ github: attachGithub })
            : undefined,
        });
        const { data } = await readJsonSafe<{
          error?: string;
          gravity?: number;
          founder_score?: number;
          profile?: { providers?: string[]; errors?: string[] };
        }>(res);
        if (!res.ok) {
          notes.push(`${id}: ${data?.error || res.status}`);
        } else {
          notes.push(
            `${id.slice(0, 16)}… g${Number(data?.gravity ?? 0).toFixed(0)} · FS ${Number(data?.founder_score ?? 0).toFixed(0)}${
              data?.profile?.providers?.length
                ? ` · ${data.profile.providers.join("+")}`
                : ""
            }`,
          );
        }
      }
      setEnrichNote(notes.join(" · "));
      await load({ keepSelection: true });
    } catch (e) {
      setEnrichNote(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div>
      <p className="section-label mb-2">VC Brain</p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Gravity compare
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Live side-by-side: gravity, three independent axes, Trust contradictions,
        thesis fit, and $100K lean — never averaged. Not the marketing teaching
        diagram (89/27).
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          type="button"
          className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
          onClick={() => void enrichSides()}
          disabled={enriching || !leftId || !rightId}
        >
          {enriching ? "Enriching…" : "Enrich public signals"}
        </button>
        <Link
          href="/app/radar"
          prefetch
          className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
        >
          Radar · Identify
        </Link>
        <Link
          href="/app/apply"
          prefetch
          className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
        >
          Inbound apply + GitHub
        </Link>
      </div>

      {enrichNote ? (
        <p className="mt-3 text-xs text-muted" role="status">
          {enrichNote}
        </p>
      ) : null}

      {bothThin && left && right ? (
        <div
          className="panel mt-6 max-w-2xl border-warn/40 p-4 text-sm text-muted"
          role="status"
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-warn">
            Thin gravity
          </p>
          <p className="mt-2">
            Both sides look like inbound-only rows (no GitHub mass yet) — scores
            near zero is expected, not a frozen UI. Paste a GitHub login for the
            left founder below, then Enrich — or Identify live GitHub founders
            on Radar for a real inversion.
          </p>
          <label className="mt-3 block text-xs text-muted">
            GitHub for left side (optional override)
            <input
              className="input-field mt-1 font-mono text-sm"
              placeholder="Anand-0037"
              value={githubHint}
              onChange={(e) => setGithubHint(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {pool.length >= 2 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Left
            </span>
            <select
              className="mt-1 w-full border border-line bg-bg-panel px-3 py-2 text-sm text-ink"
              value={leftId ?? ""}
              onChange={(e) => setLeftId(e.target.value)}
            >
              {pool.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · g{(f.gravity?.gravity_score ?? 0).toFixed(0)}
                  {f.gravity_thin ? " · thin" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Right
            </span>
            <select
              className="mt-1 w-full border border-line bg-bg-panel px-3 py-2 text-sm text-ink"
              value={rightId ?? ""}
              onChange={(e) => setRightId(e.target.value)}
            >
              {pool.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · g{(f.gravity?.gravity_score ?? 0).toFixed(0)}
                  {f.gravity_thin ? " · thin" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-10 text-sm text-muted">Loading comparison…</p>
      ) : error && !left && !right ? (
        <div className="panel mt-10 max-w-xl border-warn/40 p-5">
          <p className="text-sm text-warn" role="alert">
            {error}
          </p>
          {/sign in|session|401|unauthorized/i.test(error) ? (
            <Link
              href="/login?next=/app/compare"
              className="mt-3 inline-block text-sm text-accent hover:underline"
            >
              Sign in →
            </Link>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/app/radar"
                className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
              >
                Open radar
              </Link>
              <Link
                href="/app/apply"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
              >
                Inbound apply
              </Link>
            </div>
          )}
        </div>
      ) : left && right ? (
        <div className="mt-10">
          <GravityCompare
            left={toSide(left)}
            right={toSide(right)}
            thesis="Pedigree ≠ distribution gravity. Disagreement across axes is the decision."
          />
        </div>
      ) : null}
    </div>
  );
}
