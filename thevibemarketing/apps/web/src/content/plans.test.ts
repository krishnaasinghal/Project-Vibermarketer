/**
 * Spec ML-8: public plans use the locked public labels and INR pricing.
 * Dodo SKU identifiers remain an implementation detail.
 */
import { PUBLIC_PLANS } from "./plans";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

assert(PUBLIC_PLANS.starter.name === "Starter", "Starter is public");
assert(PUBLIC_PLANS.starter.priceInr === "₹1,499", "Starter price is locked");
assert(PUBLIC_PLANS.starter.priceUsd === "$18", "Starter USD anchor is locked");
assert(PUBLIC_PLANS.starter.dodoTier === "solo", "Starter maps to solo internally");

assert(PUBLIC_PLANS.growth.name === "Growth", "Growth is public");
assert(PUBLIC_PLANS.growth.priceInr === "₹3,999", "Growth price is locked");
assert(PUBLIC_PLANS.growth.priceUsd === "$48", "Growth USD anchor is locked");
assert(PUBLIC_PLANS.growth.dodoTier === "startup", "Growth maps to startup internally");

assert(PUBLIC_PLANS.pro.name === "Pro", "Pro is public");
assert(PUBLIC_PLANS.pro.priceInr === "₹7,999", "Pro price is locked");
assert(PUBLIC_PLANS.pro.priceUsd === "$95", "Pro USD anchor is locked");
assert(PUBLIC_PLANS.pro.dodoTier === null, "Pro has no live Dodo SKU");

console.log("plans.test: ok");
