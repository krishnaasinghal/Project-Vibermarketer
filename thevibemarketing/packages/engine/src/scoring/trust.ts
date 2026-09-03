import type { Claim, Product, Signal } from '../types';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

/** Parse loose traction phrases into structured hints. */
export function parseClaimMetrics(text: string): {
  users?: number;
  mrr?: number;
  arr?: number;
  downloads?: number;
  stars_claimed?: number;
} {
  const t = text.toLowerCase();
  const out: ReturnType<typeof parseClaimMetrics> = {};

  const userMatch =
    t.match(
      /(\d+(?:[.,]\d+)?)\s*(k|m|thousand|million)?\s*(?:\+)?\s*(?:users?|customers?|signups?)/i,
    ) ??
    t.match(/(?:users?|customers?|signups?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(k|m)?/i);
  if (userMatch) {
    let n = parseFloat(userMatch[1]!.replace(',', ''));
    const unit = (userMatch[2] ?? '').toLowerCase();
    if (unit === 'k' || unit === 'thousand') n *= 1_000;
    if (unit === 'm' || unit === 'million') n *= 1_000_000;
    out.users = n;
  }

  const mrr = t.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(k|m)?\s*(?:mrr|monthly)/i);
  if (mrr) {
    let n = parseFloat(mrr[1]!.replace(',', ''));
    const unit = (mrr[2] ?? '').toLowerCase();
    if (unit === 'k') n *= 1_000;
    if (unit === 'm') n *= 1_000_000;
    out.mrr = n;
  }

  const arr = t.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(k|m)?\s*(?:arr|annual)/i);
  if (arr) {
    let n = parseFloat(arr[1]!.replace(',', ''));
    const unit = (arr[2] ?? '').toLowerCase();
    if (unit === 'k') n *= 1_000;
    if (unit === 'm') n *= 1_000_000;
    out.arr = n;
  }

  const dl = t.match(/(\d+(?:[.,]\d+)?)\s*(k|m)?\s*(?:downloads?|installs?)/i);
  if (dl) {
    let n = parseFloat(dl[1]!.replace(',', ''));
    const unit = (dl[2] ?? '').toLowerCase();
    if (unit === 'k') n *= 1_000;
    if (unit === 'm') n *= 1_000_000;
    out.downloads = n;
  }

  const stars = t.match(/(\d+(?:[.,]\d+)?)\s*(k)?\s*(?:github\s*)?stars?/i);
  if (stars) {
    let n = parseFloat(stars[1]!.replace(',', ''));
    if ((stars[2] ?? '').toLowerCase() === 'k') n *= 1_000;
    out.stars_claimed = n;
  }

  return out;
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

function engagementThin(
  stars: number,
  hn: number,
  forks: number,
  followers: number,
): boolean {
  return stars < 50 && hn < 30 && forks < 10 && followers < 200;
}

function claimKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function claimRank(c: {
  evidence_url?: string;
  confidence?: number;
  contradiction?: boolean;
}): number {
  let r = 0;
  if (c.evidence_url) r += 10;
  if (typeof c.confidence === 'number') r += c.confidence;
  if (c.contradiction) r += 2; // keep flagged variants over clean dupes
  return r;
}

/**
 * Collapse identical claim text (founder + product often duplicate).
 * On collision, keep the richer claim (evidence / higher confidence).
 */
export function dedupeClaims<T extends { text: string } & Partial<Claim>>(claims: T[]): T[] {
  const best = new Map<string, T>();
  for (const c of claims) {
    const key = claimKey(c.text);
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || claimRank(c) >= claimRank(prev)) best.set(key, c);
  }
  return [...best.values()];
}

/**
 * Evaluate product claims against observable signals.
 * Returns Claim[] with confidence + contradiction flags.
 */
export function evaluateClaims(
  claims: Array<Pick<Claim, 'text' | 'category'> & Partial<Claim>>,
  signals: Signal[],
  product?: Product,
): Claim[] {
  const stars = maxFromSignals(signals, ['stars', 'stargazers_count', 'github_stars']);
  const forks = maxFromSignals(signals, ['forks', 'forks_count']);
  const hn = maxFromSignals(signals, ['hn_points', 'points', 'score']);
  const followers = maxFromSignals(signals, ['followers', 'follower_count', 'audience']);

  const sourceClaims = dedupeClaims(
    claims.length ? claims : (product?.traction_claims ?? []).map((c) => c),
  );

  return sourceClaims.map((raw) => {
    const text = raw.text;
    const metrics = parseClaimMetrics(text);
    let contradiction = Boolean(raw.contradiction);
    let contradiction_note = raw.contradiction_note;
    let confidence = raw.confidence ?? 0.55;

    // Labeled Diligence probe — always contradict so Trust → $100K NO
    // is demoable on any live founder (high-star or thin-signal).
    if (/^diligence probe:/i.test(text.trim())) {
      return {
        text,
        category: raw.category || 'traction',
        evidence_url: raw.evidence_url,
        confidence: clamp01(Math.min(confidence, 0.2)),
        contradiction: true,
        contradiction_note:
          "Labeled Diligence probe: overstated traction claim inserted for Trust verification — not the founder's own statement",
      };
    }

    if (metrics.users !== undefined && metrics.users >= 5_000 && stars > 0 && stars < 100) {
      contradiction = true;
      contradiction_note =
        `Claimed ~${metrics.users.toLocaleString()} users but observable GitHub stars are ${stars} (<100) — traction claim weakly supported by public repo signal`;
      confidence = Math.min(confidence, 0.25);
    }

    if (metrics.stars_claimed !== undefined) {
      const hasGh = signals.some((s) => /github/i.test(s.source) || /github\.com/i.test(s.url ?? ''));
      if (hasGh && stars > 0) {
        if (metrics.stars_claimed > stars * 3 + 50) {
          contradiction = true;
          contradiction_note = `Claimed ${metrics.stars_claimed} stars vs observed ${stars}`;
          confidence = Math.min(confidence, 0.2);
        } else {
          confidence = Math.max(confidence, 0.75);
        }
      } else if (hasGh && stars === 0 && metrics.stars_claimed >= 100) {
        contradiction = true;
        contradiction_note = `Claimed ${metrics.stars_claimed} stars but no observable GitHub star signal`;
        confidence = Math.min(confidence, 0.25);
      }
    }

    if (
      metrics.mrr !== undefined &&
      metrics.mrr >= 10_000 &&
      engagementThin(stars, hn, forks, followers)
    ) {
      contradiction = true;
      contradiction_note =
        `Claimed ~$${metrics.mrr.toLocaleString()} MRR with thin public traction (stars=${stars}, hn=${hn}, followers=${followers})`;
      confidence = Math.min(confidence, 0.3);
    }

    if (
      metrics.arr !== undefined &&
      metrics.arr >= 50_000 &&
      engagementThin(stars, hn, forks, followers)
    ) {
      contradiction = true;
      contradiction_note =
        `Claimed ~$${metrics.arr.toLocaleString()} ARR against thin observable footprint`;
      confidence = Math.min(confidence, 0.28);
    }

    if (raw.evidence_url && !contradiction) {
      confidence = clamp01(Math.max(confidence, 0.7));
    }

    if (
      metrics.users !== undefined &&
      metrics.users <= 1_000 &&
      stars >= 50 &&
      !contradiction
    ) {
      confidence = clamp01(Math.max(confidence, 0.65));
    }

    return {
      text,
      category: raw.category || 'traction',
      evidence_url: raw.evidence_url,
      confidence: clamp01(confidence),
      contradiction,
      contradiction_note,
    };
  });
}
