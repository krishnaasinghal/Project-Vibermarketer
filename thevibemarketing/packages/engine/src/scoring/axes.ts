import type {
  AxisScore,
  AxisScreenInput,
  Product,
  Screening,
  Thesis,
  Trend,
} from '../types';
import { sectorMatchesThesis } from './sector-match';

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function labelFor(score: number, abstain?: boolean): string {
  if (abstain) return 'insufficient signal';
  if (score >= 75) return 'strong';
  if (score >= 55) return 'promising';
  if (score >= 40) return 'mixed';
  return 'weak';
}

/** Brief §6 Market axis: bullish / neutral / bear — not averaged into overall. */
function marketStance(score: number, abstain?: boolean): {
  stance: 'bullish' | 'neutral' | 'bear';
  label: string;
} {
  if (abstain) return { stance: 'neutral', label: 'neutral · insufficient signal' };
  if (score >= 65) return { stance: 'bullish', label: 'bullish' };
  if (score >= 45) return { stance: 'neutral', label: 'neutral' };
  return { stance: 'bear', label: 'bear' };
}

/**
 * Compare newest prior screening to the score we're about to store.
 * (Old impl compared last two history rows and ignored the current score.)
 */
function trendVsPrior(
  history: Screening[] | undefined,
  pick: (s: Screening) => AxisScore,
  currentScore: number,
): Trend {
  if (!history?.length) return 'stable';
  const prior = pick(history[history.length - 1]!).score;
  const delta = currentScore - prior;
  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'declining';
  return 'stable';
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function sectorMatch(product: Product | undefined, thesis: Thesis | null | undefined): {
  match: boolean;
  note: string;
} {
  if (!thesis?.sectors?.length) return { match: true, note: 'No sector filter on thesis' };
  if (!product?.sector) {
    return { match: false, note: 'Product sector not disclosed — thesis filter cannot confirm fit' };
  }
  const hit = sectorMatchesThesis(product.sector, thesis.sectors);
  return {
    match: hit,
    note: hit
      ? `Sector "${product.sector}" matches thesis [${thesis.sectors.join(', ')}]`
      : `Sector "${product.sector}" outside thesis [${thesis.sectors.join(', ')}]`,
  };
}

function stageMatch(product: Product | undefined, thesis: Thesis | null | undefined): {
  match: boolean;
  note: string;
} {
  if (!thesis?.stage) return { match: true, note: 'No stage filter on thesis' };
  if (!product?.stage) {
    return { match: false, note: 'Product stage not disclosed — thesis filter cannot confirm fit' };
  }
  const match =
    normalize(product.stage).includes(normalize(thesis.stage)) ||
    normalize(thesis.stage).includes(normalize(product.stage));
  return {
    match,
    note: match
      ? `Stage "${product.stage}" aligns with thesis "${thesis.stage}"`
      : `Stage "${product.stage}" mismatches thesis "${thesis.stage}"`,
  };
}

/**
 * Three-axis screener. Returns independent AxisScores — NEVER averaged.
 * Thesis sector/stage mismatches lower market and idea axes with explicit rationale.
 */
export function screenAxes(input: AxisScreenInput): Screening {
  const { founder, product, thesis, history, claims } = input;
  const contradictionCount = (claims ?? founder.claims ?? []).filter((c) => c.contradiction).length;
  const trustPenalty = Math.min(25, contradictionCount * 12);

  const fs = founder.founder_score;
  const grav = founder.gravity.gravity_score;
  const conf = founder.score_confidence;
  let founderScore = clamp(0.55 * fs + 0.35 * grav + 0.1 * (100 * conf));
  founderScore = clamp(founderScore - trustPenalty * 0.5);

  const founderAbstain = Boolean(founder.gravity.abstain && fs < 30);
  const founderAxisScore = founderAbstain ? clamp(founderScore * 0.6) : founderScore;
  const founder_axis: AxisScore = {
    score: founderAxisScore,
    label: labelFor(founderScore, founderAbstain),
    trend: trendVsPrior(history, (s) => s.founder_axis, founderAxisScore),
    rationale: [
      `Founder Score ${fs.toFixed(1)} (conf ${(conf * 100).toFixed(0)}%)`,
      `gravity ${grav.toFixed(1)}${founder.gravity.abstain ? ' [abstain]' : ''}`,
      contradictionCount > 0
        ? `${contradictionCount} claim contradiction(s) applied`
        : 'no claim contradictions',
    ].join('; '),
    confidence: clamp01(conf * (founderAbstain ? 0.5 : 0.9)),
    abstain: founderAbstain || undefined,
  };

  const sec = sectorMatch(product, thesis);
  const stg = stageMatch(product, thesis);
  let marketScore = 55;
  if (product?.sector) marketScore += 10;
  if (product?.oneliner) marketScore += 5;
  if (sec.match) marketScore += 15;
  else marketScore -= 20;
  if (stg.match) marketScore += 10;
  else marketScore -= 15;
  marketScore = clamp(marketScore - trustPenalty * 0.3);

  const marketAbstain = !product?.sector && !thesis?.sectors?.length;
  const mStance = marketStance(marketScore, marketAbstain);
  const market_axis: AxisScore = {
    score: marketScore,
    label: mStance.label,
    stance: mStance.stance,
    trend: trendVsPrior(history, (s) => s.market_axis, marketScore),
    rationale: [
      `Market stance: ${mStance.stance}`,
      sec.note,
      stg.note,
      product?.oneliner ? `wedge: ${product.oneliner}` : 'wedge: not disclosed',
    ].join('; '),
    confidence: clamp01(product?.sector ? 0.65 : 0.35),
    abstain: marketAbstain || undefined,
  };

  let ideaScore = 50;
  if (product?.oneliner) ideaScore += 12;
  if (product?.traction_claims?.length) {
    const avgConf =
      product.traction_claims.reduce((a, c) => a + c.confidence, 0) /
      product.traction_claims.length;
    ideaScore += 20 * avgConf;
  }
  if (founderScore >= 70) ideaScore += 8;
  if (!sec.match) ideaScore -= 18;
  if (!stg.match) ideaScore -= 12;
  ideaScore = clamp(ideaScore - trustPenalty);

  const ideaAbstain = !product;
  const ideaAxisScore = ideaAbstain ? 35 : ideaScore;
  const idea_axis: AxisScore = {
    score: ideaAxisScore,
    label: labelFor(ideaAxisScore, ideaAbstain),
    trend: trendVsPrior(history, (s) => s.idea_axis, ideaAxisScore),
    rationale: ideaAbstain
      ? 'No product attached — idea-vs-market cannot be assessed'
      : [
          'idea score from oneliner/traction + founder pivot capacity',
          sec.match ? 'sector fit supports idea' : 'sector mismatch pressures idea',
          stg.match ? 'stage fit' : 'stage mismatch',
        ].join('; '),
    confidence: clamp01(ideaAbstain ? 0.25 : 0.55 + (product?.traction_claims?.length ? 0.2 : 0)),
    abstain: ideaAbstain || undefined,
  };

  return {
    founder_id: founder.id,
    product_id: product?.id,
    founder_axis,
    market_axis,
    idea_axis,
    scored_at: new Date().toISOString(),
  };
}
