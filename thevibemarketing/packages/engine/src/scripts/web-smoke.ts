/**
 * Offline smoke: engine gravity inversion + monorepo shape.
 * Tracked copy — root `scripts/` is gitignored for live probes.
 *
 * Usage (from repo root): pnpm smoke:web
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeFounderScoreFromGravity } from "../scoring/founder-score";
import { scoreGravityFromSignals } from "../scoring/gravity";
import type { Signal } from "../types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function findRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // packages/engine/src/scripts → repo root
  const candidates = [
    resolve(here, "../../../../"),
    resolve(process.cwd()),
    resolve(process.cwd(), "../.."),
  ];
  for (const dir of candidates) {
    if (
      existsSync(resolve(dir, "pnpm-workspace.yaml")) &&
      existsSync(resolve(dir, "packages/engine/package.json"))
    ) {
      return dir;
    }
  }
  return resolve(here, "../../../../");
}

const now = new Date().toISOString();

const coldStart: Signal[] = [
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

const resumeStrong: Signal[] = [
  {
    id: "3",
    entity_type: "founder",
    entity_id: "resume",
    source: "github",
    url: "https://github.com/resume/big",
    payload: {
      stars: 50_000,
      followers: 80_000,
      engagement: 200,
      commits_30d: 2,
      shipping_events: 1,
    },
    observed_at: now,
    ingested_at: now,
  },
];

const root = findRepoRoot();
const required = [
  "apps/web/package.json",
  "packages/engine/package.json",
  "data/default-thesis.json",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/vc-brain/page.tsx",
  "apps/web/src/app/app/radar/page.tsx",
  "apps/web/src/app/app/compare/page.tsx",
  "apps/web/src/app/api/ingest/route.ts",
  "supabase/migrations/20260718220000_profiles.sql",
  "supabase/migrations/20260719010000_vc_brain_memory.sql",
  "supabase/migrations/20260719020000_vc_brain_dual_write.sql",
];

console.log("--- web-smoke: repo shape ---");
console.log(`  root ${root}`);
for (const rel of required) {
  const p = resolve(root, rel);
  assert(existsSync(p), `missing ${rel}`);
  console.log(`  ok ${rel}`);
}

console.log("--- web-smoke: gravity inversion ---");
const gCold = scoreGravityFromSignals(coldStart);
const gResume = scoreGravityFromSignals(resumeStrong);
const fsCold = composeFounderScoreFromGravity(gCold, {
  coherence: 0.7,
  track_record: null,
});
const fsResume = composeFounderScoreFromGravity(gResume, {
  coherence: 0.5,
  track_record: 0.8,
});

console.log({
  cold_gravity: Math.round(gCold.gravity_score),
  resume_gravity: Math.round(gResume.gravity_score),
  cold_fs: Math.round(fsCold.founder_score),
  resume_fs: Math.round(fsResume.founder_score),
  cold_start: fsCold.cold_start,
});

assert(
  gCold.gravity_score > gResume.gravity_score,
  `cold-start gravity (${gCold.gravity_score}) should beat resume-strong (${gResume.gravity_score})`,
);
assert(
  fsCold.founder_score > fsResume.founder_score,
  `cold-start founder score should beat resume-strong`,
);
assert(
  fsCold.cold_start === true,
  "cold-start flag should be true for null track_record",
);

console.log("\nOK — web-smoke passed (shape + gravity inversion)");
