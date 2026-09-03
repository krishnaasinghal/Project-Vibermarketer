import type { FounderScoreInputs, GravityBreakdown } from '../types';

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export type FounderScoreResult = {
  founder_score: number;
  score_confidence: number;
  weights: {
    gravity: number;
    cadence: number;
    coherence: number;
    track_record: number;
  };
  components: {
    gravity: number;
    cadence: number;
    coherence: number;
    track_record: number | null;
  };
  evidence: string[];
  cold_start: boolean;
};

/**
 * Persistent Founder Score compositor.
 *
 * Base weights: gravity 0.45, cadence 0.20, coherence 0.15, track_record 0.20.
 * If track_record is missing/null, its weight redistributes proportionally
 * across the other three (anti cold-start bias — no zero-penalty for first-timers).
 */
export function composeFounderScore(input: FounderScoreInputs): FounderScoreResult {
  const gravity = clamp(input.gravity_score);
  const cadence = clamp(input.cadence * (input.cadence <= 1 ? 100 : 1));
  const coherence = clamp(input.coherence ?? 50);
  const hasTrack =
    input.track_record !== undefined &&
    input.track_record !== null &&
    Number.isFinite(input.track_record);
  const track_record = hasTrack ? clamp(input.track_record as number) : null;

  const base = {
    gravity: 0.45,
    cadence: 0.2,
    coherence: 0.15,
    track_record: 0.2,
  };

  let weights: FounderScoreResult['weights'];
  if (hasTrack) {
    weights = { ...base };
  } else {
    const remaining = base.gravity + base.cadence + base.coherence;
    const bonus = base.track_record;
    weights = {
      gravity: base.gravity + (base.gravity / remaining) * bonus,
      cadence: base.cadence + (base.cadence / remaining) * bonus,
      coherence: base.coherence + (base.coherence / remaining) * bonus,
      track_record: 0,
    };
  }

  const founder_score = clamp(
    weights.gravity * gravity +
      weights.cadence * cadence +
      weights.coherence * coherence +
      weights.track_record * (track_record ?? 0),
  );

  const completeness = hasTrack ? 1 : 0.75;
  const score_confidence = clamp01(
    0.4 * clamp01(input.gravity_confidence) +
      0.35 * completeness +
      0.25 * (gravity > 0 ? 0.8 : 0.3),
  );

  const evidence = [...(input.evidence ?? [])];
  evidence.push(
    hasTrack
      ? `weights: g=${weights.gravity.toFixed(2)} c=${weights.cadence.toFixed(2)} coh=${weights.coherence.toFixed(2)} tr=${weights.track_record.toFixed(2)}`
      : `cold-start: track_record weight redistributed (g=${weights.gravity.toFixed(2)} c=${weights.cadence.toFixed(2)} coh=${weights.coherence.toFixed(2)})`,
  );
  evidence.push(
    `components: gravity=${gravity.toFixed(1)} cadence=${cadence.toFixed(1)} coherence=${coherence.toFixed(1)} track=${track_record ?? 'n/a'}`,
  );

  return {
    founder_score,
    score_confidence,
    weights,
    components: { gravity, cadence, coherence, track_record },
    evidence,
    cold_start: !hasTrack,
  };
}

/** Compose from a gravity breakdown + optional extras. */
export function composeFounderScoreFromGravity(
  gravity: GravityBreakdown,
  opts?: {
    coherence?: number;
    track_record?: number | null;
  },
): FounderScoreResult {
  return composeFounderScore({
    gravity_score: gravity.gravity_score,
    gravity_confidence: gravity.confidence,
    cadence: gravity.components.cadence,
    coherence: opts?.coherence,
    track_record: opts?.track_record,
    evidence: gravity.evidence,
  });
}
