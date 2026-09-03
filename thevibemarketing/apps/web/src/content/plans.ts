/**
 * Locked public pricing for vibemarketer.
 *
 * `dodoTier` is intentionally internal: it is the temporary checkout SKU
 * mapping, not a customer-facing plan name.
 */
export const PUBLIC_PLANS = {
  starter: {
    name: "Starter",
    priceInr: "₹1,499",
    priceUsd: "$18",
    dodoTier: "solo",
  },
  growth: {
    name: "Growth",
    priceInr: "₹3,999",
    priceUsd: "$48",
    dodoTier: "startup",
  },
  pro: {
    name: "Pro",
    priceInr: "₹7,999",
    priceUsd: "$95",
    dodoTier: null,
  },
} as const;

export const PUBLIC_PRICING_SUMMARY = `${PUBLIC_PLANS.starter.name} ${PUBLIC_PLANS.starter.priceInr} · ${PUBLIC_PLANS.growth.name} ${PUBLIC_PLANS.growth.priceInr} · ${PUBLIC_PLANS.pro.name} ${PUBLIC_PLANS.pro.priceInr}`;
