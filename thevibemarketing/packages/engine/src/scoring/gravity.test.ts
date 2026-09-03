/**
 * Lightweight self-check: cold-start vs resume-strong gravity.
 * Run: npm run test:gravity
 */
import { scoreGravity } from './gravity';
import { composeFounderScore } from './founder-score';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const cold = scoreGravity({
  stars: 42,
  forks: 8,
  hn_points: 180,
  followers: 12,
  engagement: 220,
  post_count: 4,
  shipping_events: 6,
  window_months: 3,
  evidence: ['hn: Show HN post', 'github: small repo'],
});

const resumeStrong = scoreGravity({
  stars: 12_000,
  forks: 900,
  hn_points: 40,
  followers: 80_000,
  engagement: 2_500,
  post_count: 40,
  shipping_events: 3,
  window_months: 3,
  evidence: ['github: popular infra repo'],
});

const thin = scoreGravity({
  stars: 0,
  forks: 0,
  hn_points: 0,
  followers: 0,
  engagement: 0,
  post_count: 0,
  shipping_events: 0,
});

console.log('--- cold-start (tiny audience, strong HN/engagement) ---');
console.log(
  JSON.stringify(
    {
      gravity_score: cold.gravity_score,
      confidence: cold.confidence,
      abstain: cold.abstain,
      velocity: cold.components.velocity,
      pull_ratio: cold.components.pull_ratio,
      cadence: cold.components.cadence,
    },
    null,
    2,
  ),
);

console.log('--- resume-strong (big audience + stars) ---');
console.log(
  JSON.stringify(
    {
      gravity_score: resumeStrong.gravity_score,
      confidence: resumeStrong.confidence,
      abstain: resumeStrong.abstain,
      velocity: resumeStrong.components.velocity,
      pull_ratio: resumeStrong.components.pull_ratio,
      cadence: resumeStrong.components.cadence,
    },
    null,
    2,
  ),
);

console.log('--- thin (should abstain) ---');
console.log(
  JSON.stringify(
    {
      gravity_score: thin.gravity_score,
      confidence: thin.confidence,
      abstain: thin.abstain,
    },
    null,
    2,
  ),
);

const coldFs = composeFounderScore({
  gravity_score: cold.gravity_score,
  gravity_confidence: cold.confidence,
  cadence: cold.components.cadence,
  coherence: 60,
  track_record: null,
});

const resumeFs = composeFounderScore({
  gravity_score: resumeStrong.gravity_score,
  gravity_confidence: resumeStrong.confidence,
  cadence: resumeStrong.components.cadence,
  coherence: 70,
  track_record: 85,
});

console.log('--- founder scores ---');
console.log({
  cold_start: {
    score: coldFs.founder_score,
    cold_start: coldFs.cold_start,
    weights: coldFs.weights,
  },
  resume: {
    score: resumeFs.founder_score,
    cold_start: resumeFs.cold_start,
    weights: resumeFs.weights,
  },
});

assert(Boolean(thin.abstain), 'thin input must abstain');
assert(
  cold.components.velocity > resumeStrong.components.velocity,
  'cold velocity should beat resume',
);
assert(!cold.abstain, 'cold-start with HN+engagement should not abstain');
assert(coldFs.cold_start === true, 'missing track_record marks cold_start');
assert(coldFs.weights.track_record === 0, 'track_record weight redistributed');
assert(
  Math.abs(
    coldFs.weights.gravity + coldFs.weights.cadence + coldFs.weights.coherence - 1,
  ) < 1e-9,
  'redistributed weights sum to 1',
);

console.log('\nOK — gravity + founder-score self-check passed');
