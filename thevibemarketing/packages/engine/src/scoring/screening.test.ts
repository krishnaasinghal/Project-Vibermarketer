/**
 * Self-checks: ownership normalize, first-pass, thesis fit, market stance.
 * Run: npm run test:screening  (or npm test)
 */
import { normalizeOwnershipTarget } from "../thesis";
import { firstPassScreen } from "./first-pass";
import { thesisFit } from "./thesis-fit";
import { screenAxes } from "./axes";
import { scoreGravity } from "./gravity";
import { decide100k } from "../memo/build";
import type { Founder, Product, Screening, Thesis } from "../types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

// --- ownership normalize ---
assert(normalizeOwnershipTarget(10) === 0.1, "10 → 0.1 (percent points)");
assert(normalizeOwnershipTarget("8-12%") === 0.08, '"8-12%" → 0.08 (first number)');
assert(normalizeOwnershipTarget(0.1) === 0.1, "0.1 stays fraction");
assert(normalizeOwnershipTarget("10%") === 0.1, '"10%" → 0.1');

// --- first-pass: inbound without materials fails ---
const thinG = scoreGravity({
  stars: 5,
  forks: 1,
  hn_points: 20,
  followers: 10,
  engagement: 30,
  post_count: 2,
  shipping_events: 1,
});

const inboundFounder: Founder = {
  id: "f-inbound",
  name: "Inbound Founder",
  handles: {},
  links: [],
  bio: "Building something in AI infra",
  claims: [],
  founder_score: 40,
  score_confidence: 0.5,
  gravity: thinG,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const inboundProduct: Product = {
  id: "p-inbound",
  founder_id: inboundFounder.id,
  name: "Deckless Co",
  oneliner: "Agent tools for founders",
  sector: "AI infra",
  stage: "pre-seed",
  traction_claims: [],
  // no domain → no materials
};

const inboundFail = firstPassScreen({
  founder: inboundFounder,
  product: inboundProduct,
  thesis: {
    sectors: ["AI infra"],
    stage: "pre-seed",
    geo: "global",
    check_size: 100_000,
    ownership_target: 0.1,
    risk: "moderate",
  },
  requireDeck: true,
});

assert(!inboundFail.pass, "inbound without materials must fail");
assert(
  inboundFail.reasons.some((r) => /deck|product site|materials/i.test(r)),
  "fail reason mentions materials",
);

const withProductSite = firstPassScreen({
  founder: {
    ...inboundFounder,
    links: ["https://kaggleingest.com/"],
  },
  product: inboundProduct,
  requireDeck: true,
});
assert(withProductSite.pass, "inbound with product site URL passes first-pass");

const withDeck = firstPassScreen({
  founder: {
    ...inboundFounder,
    links: ["https://notion.so/pitch-deck"],
  },
  product: inboundProduct,
  requireDeck: true,
});
assert(withDeck.pass, "inbound with deck link passes first-pass");

// Sector outside thesis must NOT hard-fail first-pass (memo still runs → NO/WATCH).
const sectorMissStillRuns = firstPassScreen({
  founder: {
    ...inboundFounder,
    links: ["https://vibemarketer.fun/"],
    bio: "AI marketing for founders",
  },
  product: {
    ...inboundProduct,
    name: "vibemarketer",
    oneliner: "Paste your product URL. Get a brand brief.",
    sector: "marketing",
  },
  thesis: {
    sectors: ["AI infra", "developer tools", "enterprise SaaS", "agentic software"],
    stage: "pre-seed",
    geo: "global",
    check_size: 100_000,
    ownership_target: 0.1,
    risk: "moderate",
  },
  requireDeck: true,
});
assert(
  sectorMissStillRuns.pass,
  "inbound with materials + out-of-thesis sector still passes first-pass",
);
assert(
  sectorMissStillRuns.checks.some((c) => c.name === "thesis_sector" && !c.ok),
  "thesis_sector check still flags soft miss",
);

// --- thesis fit match / miss ---
const thesis: Thesis = {
  sectors: ["AI infra", "developer tools"],
  stage: "pre-seed",
  geo: "global",
  check_size: 100_000,
  ownership_target: 0.1,
  risk: "moderate",
};

const matchFit = thesisFit(
  thesis,
  {
    id: "p1",
    founder_id: "f1",
    name: "MatchCo",
    sector: "AI infra",
    stage: "pre-seed",
    traction_claims: [],
  },
  inboundFounder,
);
assert(matchFit.fit === "match", `expected match, got ${matchFit.fit}`);

const missFit = thesisFit(
  thesis,
  {
    id: "p2",
    founder_id: "f1",
    name: "MissCo",
    sector: "consumer social",
    stage: "Series B",
    traction_claims: [],
  },
  inboundFounder,
);
assert(missFit.fit === "miss", `expected miss, got ${missFit.fit}`);

// --- market stance via screenAxes labels (bullish / bear) ---
const mockFounder: Founder = {
  id: "f-axes",
  name: "Axes Founder",
  handles: { github: "axes-dev" },
  links: [],
  bio: "Technical founder",
  claims: [],
  founder_score: 72,
  score_confidence: 0.7,
  gravity: scoreGravity({
    stars: 40,
    forks: 8,
    hn_points: 150,
    followers: 20,
    engagement: 200,
    post_count: 4,
    shipping_events: 5,
  }),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const bullishScreen = screenAxes({
  founder: mockFounder,
  product: {
    id: "p-bull",
    founder_id: mockFounder.id,
    name: "BullCo",
    oneliner: "Runtime for agentic SaaS",
    sector: "AI infra",
    stage: "pre-seed",
    traction_claims: [],
  },
  thesis,
});

const bullLabel = bullishScreen.market_axis.label.toLowerCase();
assert(
  bullLabel.includes("bullish") || bullishScreen.market_axis.stance === "bullish",
  `expected bullish market stance, got label="${bullishScreen.market_axis.label}" stance=${bullishScreen.market_axis.stance}`,
);

const bearScreen = screenAxes({
  founder: mockFounder,
  product: {
    id: "p-bear",
    founder_id: mockFounder.id,
    name: "BearCo",
    sector: "consumer social",
    stage: "Series B",
    traction_claims: [],
  },
  thesis,
});

const bearLabel = bearScreen.market_axis.label.toLowerCase();
assert(
  bearLabel.includes("bear") || bearScreen.market_axis.stance === "bear",
  `expected bear market stance, got label="${bearScreen.market_axis.label}" stance=${bearScreen.market_axis.stance}`,
);

// --- $100K: one Trust contradiction → NO (Diligence / Trust kill) ---
const trustKillScreen = {
  founder_id: "f_trust_probe",
  product_id: "p_trust_probe",
  founder_axis: {
    score: 40,
    label: "weak",
    trend: "stable" as const,
    rationale: "test",
    confidence: 0.74,
  },
  market_axis: {
    score: 91,
    label: "bullish",
    stance: "bullish" as const,
    trend: "stable" as const,
    rationale: "test",
    confidence: 0.65,
  },
  idea_axis: {
    score: 60,
    label: "promising",
    trend: "stable" as const,
    rationale: "test",
    confidence: 0.75,
  },
  scored_at: new Date().toISOString(),
} satisfies Screening;

const trustKillNo = decide100k(trustKillScreen, [
  {
    text: "10,000 users",
    category: "traction",
    confidence: 0.25,
    contradiction: true,
    contradiction_note: "stars thin",
  },
  {
    text: "$50k ARR",
    category: "traction",
    confidence: 0.5,
    contradiction: false,
  },
]);
assert(
  trustKillNo.decision === "no",
  `Trust contradiction must be $100K NO, got ${trustKillNo.decision}`,
);
assert(/contradiction/i.test(trustKillNo.rationale), "NO rationale cites contradiction");

// Thesis risk must change outcomes (not cosmetic)
const cleanClaims = [
  {
    text: "shipping weekly",
    category: "traction",
    confidence: 0.8,
    contradiction: false,
  },
];
const strongScreen = {
  ...trustKillScreen,
  founder_axis: { ...trustKillScreen.founder_axis, score: 72, label: "strong" },
  market_axis: { ...trustKillScreen.market_axis, score: 70, label: "bullish" },
  idea_axis: { ...trustKillScreen.idea_axis, score: 68, label: "promising" },
} satisfies Screening;

const yesModerate = decide100k(strongScreen, cleanClaims, {
  sectors: ["AI infra"],
  stage: "pre-seed",
  geo: "global",
  check_size: 100_000,
  ownership_target: 0.1,
  risk: "moderate",
});
assert(
  yesModerate.decision === "yes",
  `moderate should YES, got ${yesModerate.decision}`,
);
assert(
  /thesis pressure/i.test(yesModerate.rationale),
  "YES rationale must cite thesis pressure",
);

// 2 strong axes → YES under moderate, WATCH under conservative
const twoStrong = {
  ...strongScreen,
  idea_axis: { ...strongScreen.idea_axis, score: 50, label: "mixed" },
} satisfies Screening;
const modYes = decide100k(twoStrong, cleanClaims, {
  sectors: ["AI infra"],
  stage: "pre-seed",
  geo: "global",
  check_size: 100_000,
  ownership_target: 0.1,
  risk: "moderate",
});
assert(modYes.decision === "yes", `2-strong moderate YES, got ${modYes.decision}`);

const conservWatch = decide100k(twoStrong, cleanClaims, {
  sectors: ["AI infra"],
  stage: "pre-seed",
  geo: "global",
  check_size: 100_000,
  ownership_target: 0.1,
  risk: "conservative",
});
assert(
  conservWatch.decision === "watch",
  `conservative requires 3 strong axes, got ${conservWatch.decision}`,
);

console.log(
  JSON.stringify(
    {
      ownership: { ten: 0.1, range: normalizeOwnershipTarget("8-12%") },
      first_pass_inbound_no_deck: inboundFail.pass,
      thesis_fit: { match: matchFit.fit, miss: missFit.fit },
      market: {
        bullish: bullishScreen.market_axis.label,
        bear: bearScreen.market_axis.label,
      },
      trust_kill_100k: trustKillNo.decision,
    },
    null,
    2,
  ),
);

console.log("\nOK — ownership / first-pass / thesis-fit / market-stance / decide100k passed");
