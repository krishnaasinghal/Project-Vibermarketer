import type { GravityBreakdown, GravityComponents, GravityInputs, Signal } from '../types';

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

/**
 * Pull numeric gravity fields from heterogeneous signal payloads.
 * Connectors may use different key names; we accept common aliases.
 */
export function extractGravityInputs(signals: Signal[], windowMonths = 3): GravityInputs {
  let stars = 0;
  let forks = 0;
  let hn_points = 0;
  let followers = 0;
  let engagement = 0;
  let post_count = 0;
  let shipping_events = 0;
  const evidence: string[] = [];

  for (const s of signals) {
    const p = s.payload;
    stars = Math.max(stars, num(p.stars ?? p.stargazers_count ?? p.github_stars));
    forks = Math.max(forks, num(p.forks ?? p.forks_count));
    hn_points = Math.max(hn_points, num(p.hn_points ?? p.points ?? p.score));
    followers = Math.max(
      followers,
      num(p.followers ?? p.follower_count ?? p.audience ?? p.subscribers),
    );

    const eng = num(
      p.engagement ??
        p.reactions ??
        p.likes ??
        p.upvotes ??
        (num(p.stars) + num(p.forks) + num(p.hn_points) + num(p.comments)),
    );
    engagement += eng;

    post_count += Math.max(1, num(p.post_count ?? p.posts ?? (eng > 0 || s.source ? 1 : 0)));
    shipping_events += num(
      p.shipping_events ?? p.releases ?? p.launches ?? p.commits_public ?? 0,
    );

    if (s.url) {
      evidence.push(`${s.source}: ${s.url}`);
    } else if (Object.keys(p).length > 0) {
      evidence.push(`${s.source}: observed ${s.observed_at}`);
    }
  }

  if (shipping_events === 0 && signals.length > 0) {
    shipping_events = new Set(signals.map((s) => s.source)).size;
  }

  return {
    stars,
    forks,
    hn_points,
    followers,
    engagement: engagement || stars + forks + hn_points,
    post_count: Math.max(post_count, signals.length > 0 ? signals.length : 0),
    shipping_events,
    window_months: windowMonths,
    evidence: evidence.slice(0, 8),
  };
}

/**
 * Deterministic distribution-gravity scorer.
 *
 * - velocity = engagement / max(audience, 1)  — punch-above-weight
 * - pull_ratio = external_engagement / max(own_output, 1)
 * - cadence = shipping_events / window_months, normalized 0–1
 *
 * Cold-start friendly: low audience + meaningful engagement scores high on velocity.
 * Abstains when signal mass is too thin to trust.
 */
export function scoreGravity(inputs: GravityInputs): GravityBreakdown {
  const stars = Math.max(0, inputs.stars);
  const forks = Math.max(0, inputs.forks);
  const hn_points = Math.max(0, inputs.hn_points);
  const followers = Math.max(0, inputs.followers);
  const engagement = Math.max(0, inputs.engagement);
  const post_count = Math.max(0, inputs.post_count);
  const shipping_events = Math.max(0, inputs.shipping_events);
  const window = Math.max(0.5, inputs.window_months ?? 3);

  const audience = Math.max(followers, 1);
  const external_engagement = forks + hn_points + engagement * 0.5;
  const own_output = Math.max(post_count, 1);

  const velocity = engagement / audience;
  const pull_ratio = external_engagement / own_output;
  const events_per_month = shipping_events / window;
  const cadence = clamp01(events_per_month / 4);

  const velocity_score = clamp(100 * (1 - Math.exp(-velocity * 8)));
  const pull_score = clamp(100 * (1 - Math.exp(-pull_ratio * 0.35)));
  const cadence_score = clamp(cadence * 100);

  const absolute_floor = clamp(
    18 * Math.log10(1 + stars) + 10 * Math.log10(1 + hn_points) + 6 * Math.log10(1 + forks),
  );

  const gravity_score = clamp(
    0.4 * velocity_score + 0.3 * pull_score + 0.2 * cadence_score + 0.1 * absolute_floor,
  );

  const signal_mass =
    (stars > 0 ? 1 : 0) +
    (forks > 0 ? 1 : 0) +
    (hn_points > 0 ? 1 : 0) +
    (followers > 0 ? 1 : 0) +
    (engagement > 0 ? 1 : 0) +
    (post_count > 0 ? 1 : 0) +
    (shipping_events > 0 ? 1 : 0);

  const thin =
    signal_mass < 2 ||
    (engagement <= 0 && stars <= 0 && hn_points <= 0 && shipping_events <= 0);

  let confidence = clamp01(0.25 + signal_mass * 0.1 + (followers > 0 ? 0.05 : 0));
  if (thin) confidence = Math.min(confidence, 0.35);

  const evidence = [...(inputs.evidence ?? [])];
  evidence.push(
    `velocity=${velocity.toFixed(3)} (engagement ${engagement} / audience ${audience})`,
  );
  evidence.push(
    `pull_ratio=${pull_ratio.toFixed(3)} (external ${external_engagement.toFixed(1)} / output ${own_output})`,
  );
  evidence.push(
    `cadence=${cadence.toFixed(3)} (${shipping_events} events / ${window} mo → ${events_per_month.toFixed(2)}/mo)`,
  );

  const components: GravityComponents = {
    velocity,
    pull_ratio,
    cadence,
    stars,
    forks,
    hn_points,
    followers,
    engagement,
    post_count,
    shipping_events,
    audience,
    external_engagement,
    own_output,
  };

  if (thin) {
    return {
      gravity_score: clamp(gravity_score * 0.5),
      confidence,
      components,
      evidence: evidence.slice(0, 6),
      abstain: true,
      abstain_reason: 'Insufficient public signal mass for a confident gravity score',
    };
  }

  return {
    gravity_score,
    confidence,
    components,
    evidence: evidence.slice(0, 6),
  };
}

/** Convenience: signals → gravity. */
export function scoreGravityFromSignals(
  signals: Signal[],
  windowMonths = 3,
): GravityBreakdown {
  return scoreGravity(extractGravityInputs(signals, windowMonths));
}
