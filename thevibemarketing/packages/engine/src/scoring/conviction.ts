import type { Founder, GravityBreakdown, Product } from "../types";
import { thesisFit, type ThesisFit } from "./thesis-fit";
import type { Thesis } from "../types";

/**
 * Conviction threshold — brief: screening can fire when signals cross
 * a threshold on their own (fund that runs itself, human oversight).
 *
 * Tuned for early outbound Identify: gravity OR Founder Score + not a hard thesis miss.
 */
export type ConvictionInput = {
  founder: Pick<
    Founder,
    "founder_score" | "score_confidence" | "gravity"
  >;
  product?: Product | null;
  thesis?: Thesis | null;
  /** Already has a screening? Skip auto unless force. */
  alreadyScreened?: boolean;
  /** Cap how aggressive auto-screen is (0–1). Default 1. */
  aggression?: number;
};

export type ConvictionResult = {
  crossed: boolean;
  score: number;
  reasons: string[];
  thesis_fit: ThesisFit;
};

export function evaluateConviction(input: ConvictionInput): ConvictionResult {
  const g = input.founder.gravity;
  const gravity = Number(g?.gravity_score ?? 0);
  const fs = Number(input.founder.founder_score ?? 0);
  const conf = Number(input.founder.score_confidence ?? 0);
  const abstain = Boolean(g?.abstain);
  const fit = thesisFit(input.thesis, input.product, input.founder as Founder);
  const aggression = input.aggression ?? 1;

  const gravityFloor = 52 / aggression;
  const scoreFloor = 48 / aggression;
  const reasons: string[] = [];

  if (input.alreadyScreened) {
    return {
      crossed: false,
      score: 0,
      reasons: ["Already screened — auto-trigger skipped"],
      thesis_fit: fit.fit,
    };
  }

  if (fit.fit === "miss") {
    return {
      crossed: false,
      score: Math.max(gravity, fs) * 0.4,
      reasons: [`Thesis miss — ${fit.note}`],
      thesis_fit: fit.fit,
    };
  }

  let score = 0;
  if (!abstain && gravity >= gravityFloor) {
    score += 45 + Math.min(25, (gravity - gravityFloor) * 0.5);
    reasons.push(`Gravity ${gravity.toFixed(0)} ≥ ${gravityFloor.toFixed(0)}`);
  }
  if (fs >= scoreFloor) {
    score += 35 + Math.min(20, (fs - scoreFloor) * 0.4);
    reasons.push(`Founder Score ${fs.toFixed(0)} ≥ ${scoreFloor.toFixed(0)}`);
  }
  if (fit.fit === "match") {
    score += 15;
    reasons.push("Thesis match");
  } else if (fit.fit === "partial") {
    score += 8;
    reasons.push("Thesis partial");
  }
  if (conf >= 0.55) {
    score += 8;
    reasons.push(`Score confidence ${(conf * 100).toFixed(0)}%`);
  }

  const crossed = score >= 55 && reasons.length > 0 && !abstain;
  if (!crossed && reasons.length === 0) {
    reasons.push(
      abstain
        ? "Gravity abstain — waiting for denser signals"
        : `Below conviction (gravity ${gravity.toFixed(0)}, FS ${fs.toFixed(0)})`,
    );
  }

  return {
    crossed,
    score: Math.min(100, score),
    reasons,
    thesis_fit: fit.fit,
  };
}

/** Hours since first Memory write — Utility instrumentation for 24h SLA. */
export function hoursInFunnel(createdAt: string | undefined | null): number {
  if (!createdAt) return 0;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60));
}

export function formatFunnelClock(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m in funnel`;
  if (hours < 24) return `${hours.toFixed(1)}h in funnel`;
  return `${(hours / 24).toFixed(1)}d in funnel`;
}

/**
 * Soft-skill proxies with honest confidence bands (brief Area of Research #1).
 * Not validated predictors — research prototype from public footprint sparsity.
 */
export type TraitBand = {
  trait: string;
  proxy: string;
  mid: number;
  low: number;
  high: number;
  confidence: number;
  note: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Wilson-ish half-width: thinner public evidence → wider band.
 * Signal count proxies "n" in a binomial; band shrinks as n grows.
 */
function bandWidth(signalSources: number, base: number): number {
  const n = Math.max(1, signalSources);
  return clamp(base * (1.5 / Math.sqrt(n)), 6, 28);
}

export function softSkillBands(input: {
  gravity?: GravityBreakdown | null;
  founder_score?: number;
  signal_source_count?: number;
}): TraitBand[] {
  const g = input.gravity;
  const c = g?.components;
  const n = input.signal_source_count ?? 1;
  const vel = Number(c?.velocity ?? 0);
  const pull = Number(c?.pull_ratio ?? 0);
  const cadence = Number(c?.cadence ?? 0);
  const fs = Number(input.founder_score ?? 0);

  // Shipping cadence → "execution resilience" proxy (NOT measured grit).
  const shipMid = clamp(cadence * 40 + Math.min(30, vel * 2), 5, 92);
  const shipW = bandWidth(n, 18);

  // Earned pull → "founder-market attention" proxy
  const fmfMid = clamp(pull * 0.7 + Math.min(25, (g?.gravity_score ?? 0) * 0.25), 5, 92);
  const fmfW = bandWidth(n, 16);

  // Coherence of public story → "signal consistency" (not soft skill, but research-adjacent)
  const consMid = clamp(fs * 0.85 + (g?.confidence ?? 0) * 15, 5, 92);
  const consW = bandWidth(n, 14);

  return [
    {
      trait: "Execution resilience (proxy)",
      proxy: "shipping cadence + velocity",
      mid: shipMid,
      low: clamp(shipMid - shipW, 0, 100),
      high: clamp(shipMid + shipW, 0, 100),
      confidence: clamp(0.25 + n * 0.12, 0.2, 0.7),
      note: "Research prototype — public shipping ≠ psychological resilience. Wide band = sparse signals.",
    },
    {
      trait: "Founder–market attention (proxy)",
      proxy: "pull ratio + gravity",
      mid: fmfMid,
      low: clamp(fmfMid - fmfW, 0, 100),
      high: clamp(fmfMid + fmfW, 0, 100),
      confidence: clamp(0.28 + n * 0.1, 0.2, 0.65),
      note: "Earned attention relative to audience — not domain expertise pedigree.",
    },
    {
      trait: "Public-signal consistency",
      proxy: "Founder Score + gravity confidence",
      mid: consMid,
      low: clamp(consMid - consW, 0, 100),
      high: clamp(consMid + consW, 0, 100),
      confidence: clamp(0.3 + n * 0.1, 0.25, 0.75),
      note: "Interval shrinks as independent sources accumulate (data quality vs volume).",
    },
  ];
}
