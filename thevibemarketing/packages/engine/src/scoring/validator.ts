import type { Claim, Product, Signal } from '../types';
import { evaluateClaims, parseClaimMetrics } from './trust';

export type ValidatorResult = {
  validated: Claim[];
  flags: string[];
  corrected: boolean;
};

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

function maxFromSignals(signals: Signal[], keys: string[]): number {
  let m = 0;
  for (const s of signals) {
    for (const k of keys) {
      m = Math.max(m, num(s.payload[k]));
    }
  }
  return m;
}

function claimKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function claimsDiffer(a: Claim, b: Claim): boolean {
  return (
    a.confidence !== b.confidence ||
    a.contradiction !== b.contradiction ||
    (a.contradiction_note ?? '') !== (b.contradiction_note ?? '') ||
    a.text !== b.text
  );
}

/**
 * Validator / self-correction agent.
 * Cross-checks claims vs observable signals (via evaluateClaims + parseClaimMetrics),
 * collects flags, and soft-corrects overstated traction when public evidence disagrees.
 */
export function validateClaims(
  claims: Array<Pick<Claim, 'text' | 'category'> & Partial<Claim>>,
  signals: Signal[],
  product?: Product,
): ValidatorResult {
  const rechecked = evaluateClaims(claims, signals, product);
  const byKey = new Map(claims.map((c) => [claimKey(c.text), c]));

  const stars = maxFromSignals(signals, ['stars', 'stargazers_count', 'github_stars']);
  const hn = maxFromSignals(signals, ['hn_points', 'points', 'score']);
  const hasGh = signals.some(
    (s) => /github/i.test(s.source) || /github\.com/i.test(s.url ?? ''),
  );

  const flags: string[] = [];
  let corrected = false;

  const validated = rechecked.map((claim) => {
    const original = byKey.get(claimKey(claim.text));
    let next: Claim = { ...claim };
    const metrics = parseClaimMetrics(next.text);

    if (next.contradiction) {
      flags.push(next.contradiction_note ?? `Contradiction on claim: ${next.text}`);
    }

    // Soft-correct star inflation when we have a clear observed value.
    if (
      metrics.stars_claimed !== undefined &&
      hasGh &&
      stars > 0 &&
      metrics.stars_claimed > stars * 3 + 50
    ) {
      const note = `Self-corrected: claimed ${metrics.stars_claimed} stars → observed ${stars}`;
      next = {
        ...next,
        text: `${next.text.replace(/\s*$/, '')} [observed: ${stars} stars]`,
        confidence: Math.min(next.confidence, 0.2),
        contradiction: true,
        contradiction_note: next.contradiction_note
          ? `${next.contradiction_note}; ${note}`
          : note,
      };
      flags.push(note);
      corrected = true;
    }

    // Flag traction claims with numeric metrics but no public engagement signal.
    const hasNumericTraction =
      metrics.users !== undefined ||
      metrics.mrr !== undefined ||
      metrics.arr !== undefined ||
      metrics.downloads !== undefined;
    if (hasNumericTraction && stars === 0 && hn === 0 && signals.length === 0) {
      const note = `No observable signals to corroborate: ${next.text}`;
      flags.push(note);
      if (!next.contradiction) {
        next = {
          ...next,
          confidence: Math.min(next.confidence, 0.4),
          contradiction_note: next.contradiction_note ?? note,
        };
        corrected = true;
      }
    }

    // Flag high user claims with thin stars even if evaluateClaims already marked contradiction.
    if (
      metrics.users !== undefined &&
      metrics.users >= 5_000 &&
      stars > 0 &&
      stars < 100 &&
      !flags.some((f) => f.includes(String(metrics.users)))
    ) {
      flags.push(
        `Users claim (~${metrics.users.toLocaleString()}) weakly supported by stars=${stars}`,
      );
    }

    if (original) {
      const asClaim: Claim = {
        text: original.text,
        category: original.category || next.category,
        evidence_url: original.evidence_url,
        confidence: original.confidence ?? 0.55,
        contradiction: Boolean(original.contradiction),
        contradiction_note: original.contradiction_note,
      };
      if (claimsDiffer(asClaim, next)) corrected = true;
    } else if (next.contradiction) {
      corrected = true;
    }

    return next;
  });

  if (validated.length === 0 && (claims.length > 0 || (product?.traction_claims?.length ?? 0) > 0)) {
    flags.push('Validator produced empty claim set after cross-check');
  }

  return { validated, flags, corrected };
}
