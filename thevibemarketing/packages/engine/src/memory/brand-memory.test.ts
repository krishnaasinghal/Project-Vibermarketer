/**
 * Brand memory pure-function self-check (no network).
 * Run: pnpm --filter @vibe/engine test:memory
 */
import {
  brandContainerForWorkspace,
  brandSlug,
  buildCoreBrandLines,
  buildSemanticFactPayload,
  containerForBrand,
  taskSearchQuery,
} from "./brand-memory";
import { brandContainerTag } from "../connectors/supermemory";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const brand = {
  url: "https://vibemarketer.fun",
  name: "vibemarketer",
  oneliner: "Cursor for marketing",
  icp: "solo SaaS founders",
  tone: "direct, builder-native",
  pillars: ["distribution", "HITL", "memory"],
  never_say: ["guaranteed virality", "we are #1"],
  audience_notes: "vibe-coding builders",
  facts: [
    {
      id: "fact_verified",
      label: "pricing",
      value: "Starter costs INR 1499 per month",
      source: "human" as const,
      evidence_url: "https://vibemarketer.fun/pricing",
      confidence: 1,
      status: "verified" as const,
    },
    {
      id: "fact_pending",
      label: "competitor",
      value: "A possible competitor from web search",
      source: "tavily" as const,
      evidence_url: "https://example.com",
      confidence: 0.5,
      status: "pending" as const,
    },
    {
      id: "fact_rejected",
      label: "bad_claim",
      value: "Unsupported traction claim",
      source: "firecrawl" as const,
      confidence: 0.2,
      status: "rejected" as const,
    },
  ],
};

// --- slug ---
assert(brandSlug("Vibe Marketer!") === "vibe_marketer", "slug normalize");
assert(brandSlug("@@@") === "brand", "empty slug fallback");

// --- multi-tenant container ---
const a = brandContainerForWorkspace("user-abc-1234567890", "vibemarketer");
const b = brandContainerForWorkspace("user-xyz-9876543210", "vibemarketer");
assert(a !== b, "different owners must not share container");
assert(a.startsWith("ws_"), `expected ws_ prefix, got ${a}`);
assert(a.includes("brand_vibemarketer"), `expected brand slug in ${a}`);

// same owner + brand stable
assert(
  brandContainerForWorkspace("user-abc-1234567890", "vibemarketer") === a,
  "container stable",
);

// legacy name-only still works but is org_demo (not for SaaS)
const legacy = containerForBrand("vibemarketer");
assert(legacy.startsWith("org_demo:"), `legacy demo prefix, got ${legacy}`);

// supermemory helper owner form
const sm = brandContainerTag({
  ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  brandSlug: "acme",
});
assert(sm.startsWith("ws_"), sm);
assert(sm.includes("brand_acme"), sm);

// --- core lines always include identity + never ---
const core = buildCoreBrandLines(brand);
assert(core.some((l) => l.startsWith("[identity]")), "core identity");
assert(core.some((l) => l.startsWith("[icp]")), "core icp");
assert(core.some((l) => l.includes("guaranteed virality")), "core never_say");
assert(core.some((l) => l.startsWith("[audience]")), "core audience");
assert(
  core.some((l) => l.includes("Starter costs INR 1499")),
  "verified fact enters core memory",
);
assert(
  !core.some((l) => l.includes("possible competitor")),
  "pending fact must not enter core memory",
);
assert(
  !core.some((l) => l.includes("Unsupported traction")),
  "rejected fact must not enter core memory",
);

// --- semantic facts keyed ---
const facts = buildSemanticFactPayload(brand);
assert(facts.length >= 5, "enough semantic facts");
assert(
  new Set(facts.map((f) => f.key)).size === facts.length,
  "unique fact keys",
);
assert(facts.every((f) => f.isStatic), "core semantic is static");
assert(
  facts.some((f) => f.key.includes(":verified:pricing")),
  "verified fact becomes semantic memory",
);
assert(
  !facts.some((f) => f.content.includes("possible competitor")),
  "pending fact must not become semantic memory",
);

// --- task queries differ ---
assert(
  taskSearchQuery("draft_reddit", "X") !== taskSearchQuery("draft_x", "X"),
  "task queries differ",
);
assert(
  taskSearchQuery("reject_review", "X").includes("reject"),
  "reject task query",
);

console.log(
  JSON.stringify(
    {
      container_a: a,
      container_b: b,
      core_count: core.length,
      semantic_count: facts.length,
      sample_core: core.slice(0, 3),
    },
    null,
    2,
  ),
);
console.log("OK — brand-memory self-check passed");
