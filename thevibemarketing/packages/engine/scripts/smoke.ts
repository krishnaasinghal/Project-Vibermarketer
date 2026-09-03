/**
 * End-to-end smoke: gravity cold vs strong → founder score → axes → trust → memo → query.
 * Run from packages/engine: npm run smoke
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MemoryStore,
  scoreGravity,
  composeFounderScore,
  screenAxes,
  evaluateClaims,
  buildMemo,
  queryMemory,
  startRun,
  step,
} from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../data');
mkdirSync(root, { recursive: true });
const storePath = join(root, 'smoke-store.json');

async function main() {
  const store = new MemoryStore(storePath);
  await store.load();

  const run = startRun('smoke');

  const coldG = scoreGravity({
    stars: 38,
    forks: 11,
    hn_points: 210,
    followers: 8,
    engagement: 260,
    post_count: 5,
    shipping_events: 7,
    window_months: 3,
  });

  const strongG = scoreGravity({
    stars: 15_000,
    forks: 1_200,
    hn_points: 55,
    followers: 95_000,
    engagement: 3_000,
    post_count: 50,
    shipping_events: 4,
    window_months: 3,
  });

  await step(run.run_id, 'gravity', { cold: true }, coldG, coldG.evidence, store);
  await step(run.run_id, 'gravity', { cold: false }, strongG, strongG.evidence, store);

  const coldFs = composeFounderScore({
    gravity_score: coldG.gravity_score,
    gravity_confidence: coldG.confidence,
    cadence: coldG.components.cadence,
    coherence: 62,
    track_record: null,
  });

  const strongFs = composeFounderScore({
    gravity_score: strongG.gravity_score,
    gravity_confidence: strongG.confidence,
    cadence: strongG.components.cadence,
    coherence: 72,
    track_record: 88,
  });

  const coldFounder = await store.upsertFounder({
    name: 'Ada Coldstart',
    handles: { github: 'ada-cold' },
    links: ['https://github.com/ada-cold/tiny-agent'],
    bio: 'Technical founder, Berlin, building AI infra, bootstrapped',
    founder_score: coldFs.founder_score,
    score_confidence: coldFs.score_confidence,
    gravity: coldG,
    claims: [],
  });

  await store.upsertFounder({
    name: 'Reese Resume',
    handles: { github: 'reese-r' },
    links: ['https://github.com/reese-r/big-infra'],
    bio: 'Serial founder, SF, prior YC, enterprise SaaS',
    founder_score: strongFs.founder_score,
    score_confidence: strongFs.score_confidence,
    gravity: strongG,
    claims: [],
  });

  const product = await store.upsertProduct({
    founder_id: coldFounder.id,
    name: 'TinyAgent',
    domain: 'tinyagent.dev',
    oneliner: 'Agent runtime for solo SaaS founders',
    sector: 'AI infra',
    stage: 'pre-seed',
    traction_claims: [
      {
        text: '10k users in first month',
        category: 'traction',
        confidence: 0.6,
        contradiction: false,
      },
      {
        text: 'Ship weekly in public',
        category: 'cadence',
        confidence: 0.7,
        contradiction: false,
      },
    ],
  });

  await store.addSignal({
    entity_type: 'founder',
    entity_id: coldFounder.id,
    source: 'github',
    url: 'https://github.com/ada-cold/tiny-agent',
    payload: { stars: 38, forks: 11, followers: 8 },
    observed_at: new Date().toISOString(),
  });

  await store.addSignal({
    entity_type: 'founder',
    entity_id: coldFounder.id,
    source: 'hn',
    url: 'https://news.ycombinator.com/item?id=1',
    payload: { hn_points: 210, engagement: 260 },
    observed_at: new Date().toISOString(),
  });

  await store.setThesis({
    sectors: ['AI infra', 'devtools'],
    stage: 'pre-seed',
    geo: 'EU',
    check_size: 100_000,
    ownership_target: 0.07,
    risk: 'high',
  });

  const signals = await store.getSignalsFor(coldFounder.id);
  const claims = evaluateClaims(product.traction_claims, signals, product);
  const screening = screenAxes({
    founder: { ...coldFounder, claims },
    product: { ...product, traction_claims: claims },
    thesis: await store.getThesis(),
    claims,
  });
  await store.saveScreening(screening);

  const memo = buildMemo({
    founder: { ...coldFounder, claims },
    product: { ...product, traction_claims: claims },
    screening,
    thesis: await store.getThesis(),
    claims,
  });
  await store.saveMemo(memo);

  const q = queryMemory(
    'technical founder, Berlin, AI infra, enterprise traction, no prior VC backing',
    await store.listFounders(),
    (await store.snapshot()).products,
  );

  console.log('=== SMOKE RESULTS ===');
  console.log(
    'cold gravity',
    coldG.gravity_score.toFixed(1),
    'velocity',
    coldG.components.velocity.toFixed(3),
  );
  console.log(
    'strong gravity',
    strongG.gravity_score.toFixed(1),
    'velocity',
    strongG.components.velocity.toFixed(3),
  );
  console.log('cold founder_score', coldFs.founder_score.toFixed(1), 'weights', coldFs.weights);
  console.log('strong founder_score', strongFs.founder_score.toFixed(1));
  console.log('axes', {
    founder: screening.founder_axis.score,
    market: screening.market_axis.score,
    idea: screening.idea_axis.score,
  });
  console.log(
    'claims',
    claims.map((c) => ({
      text: c.text,
      contradiction: c.contradiction,
      conf: c.confidence,
    })),
  );
  console.log('decision', memo.decision, memo.decision_conf);
  console.log('gaps', memo.gaps.slice(0, 4));
  console.log(
    'nl query hits',
    q.founders.map((f) => f.name),
    'terms',
    q.matched_terms,
  );
  console.log(
    'traces',
    (await store.getTraces(run.run_id)).map((t) => t.step),
  );
  console.log('store', storePath);
  console.log('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
