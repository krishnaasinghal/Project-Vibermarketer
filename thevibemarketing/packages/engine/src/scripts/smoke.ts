/**
 * Quick gravity inversion smoke (asserting).
 *
 * Two smoke entrypoints (intentional, not duplicates):
 * - This file — fast unit-style gravity/score asserts
 *   → monorepo: `pnpm smoke` → `tsx src/scripts/smoke.ts`
 * - packages/engine/scripts/smoke.ts — fuller MemoryStore e2e
 *   → monorepo: `pnpm smoke:full` → `@vibe/engine` `npm run smoke`
 */
import { composeFounderScoreFromGravity } from "../scoring/founder-score";
import { scoreGravityFromSignals } from "../scoring/gravity";
import type { Signal } from "../types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const now = new Date().toISOString();

const hiddenGem: Signal[] = [
  {
    id: "1",
    entity_type: "founder",
    entity_id: "gem",
    source: "hackernews",
    url: "https://news.ycombinator.com/item?id=1",
    payload: {
      hn_points: 420,
      followers: 180,
      engagement: 420,
      post_count: 3,
      shipping_events: 4,
    },
    observed_at: now,
    ingested_at: now,
  },
  {
    id: "2",
    entity_type: "founder",
    entity_id: "gem",
    source: "github",
    url: "https://github.com/gem/tool",
    payload: { stars: 890, forks: 40, commits_30d: 55, shipping_events: 2 },
    observed_at: now,
    ingested_at: now,
  },
];

const resume: Signal[] = [
  {
    id: "3",
    entity_type: "founder",
    entity_id: "resume",
    source: "github",
    url: "https://github.com/resume/old",
    payload: {
      stars: 12,
      forks: 1,
      followers: 12_000,
      commits_30d: 2,
      engagement: 5,
    },
    observed_at: now,
    ingested_at: now,
  },
];

const g1 = scoreGravityFromSignals(hiddenGem);
const g2 = scoreGravityFromSignals(resume);
const s1 = composeFounderScoreFromGravity(g1, { track_record: null });
const s2 = composeFounderScoreFromGravity(g2, { track_record: 75 });

console.log("=== Distribution gravity smoke ===");
console.log("Hidden gem gravity:", g1.gravity_score, g1.components);
console.log("Resume-strong gravity:", g2.gravity_score, g2.components);
console.log(
  "Hidden gem Founder Score:",
  s1.founder_score,
  "cold_start",
  s1.cold_start,
);
console.log(
  "Resume Founder Score:",
  s2.founder_score,
  "cold_start",
  s2.cold_start,
);

assert(
  g1.gravity_score > g2.gravity_score,
  `cold-start gravity (${g1.gravity_score}) should beat resume (${g2.gravity_score})`,
);
assert(
  s1.founder_score > s2.founder_score,
  "cold-start founder score should beat resume-strong",
);
assert(s1.cold_start === true, "cold_start flag expected for null track_record");

console.log("Cold-start wins on gravity? YES");
console.log("OK");
