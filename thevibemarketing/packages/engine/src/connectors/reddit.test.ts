import { redditQueriesFromBrand } from "./reddit";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const q = redditQueriesFromBrand({
  name: "vibemarketer",
  oneliner: "Cursor for marketing for SaaS founders",
  icp: "solo SaaS founders who vibe code",
  pillars: ["distribution", "HITL", "brand memory"],
});

assert(q.length >= 2, "at least 2 queries");
assert(q.some((x) => /vibemarketer|marketing|SaaS/i.test(x)), "brand-ish query");

console.log(JSON.stringify({ queries: q }, null, 2));
console.log("OK — reddit query builder passed");
