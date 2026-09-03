/**
 * Tier feature matrix — what each plan may run (beyond monthly meters).
 * Free → Starter (solo) → Growth (startup) → Pro → Fleet
 */

import { NextResponse } from "next/server";
import {
  publicLabelForTier,
  type EntitlementTier,
} from "@/lib/payments/entitlements";
import { resolveEffectiveTier } from "@/lib/payments/run-meters";

export type FeatureKey =
  | "brand"
  | "social_draft"
  | "reddit_agent"
  | "campaign"
  | "hn_agent"
  | "seo_agent"
  | "l2_autonomy"
  | "creative"
  | "cmo_chat";

/** Minimum tier required (inclusive). free < solo < startup < pro < fleet */
const TIER_RANK: Record<EntitlementTier, number> = {
  free: 0,
  solo: 1,
  startup: 2,
  pro: 3,
  fleet: 4,
};

const FEATURE_MIN_TIER: Record<FeatureKey, EntitlementTier> = {
  brand: "free",
  social_draft: "free",
  cmo_chat: "free",
  /** Starter: Reddit + social + campaign planning */
  reddit_agent: "solo",
  campaign: "solo",
  creative: "solo",
  /** Growth: full agent wall + L2 auto-queue */
  hn_agent: "startup",
  seo_agent: "startup",
  l2_autonomy: "startup",
};

const FEATURE_LABEL: Record<FeatureKey, string> = {
  brand: "Brand onboarding",
  social_draft: "Social drafts (X · LinkedIn · Reddit)",
  reddit_agent: "Reddit agent",
  campaign: "7-day campaign brief",
  hn_agent: "Hacker News agent",
  seo_agent: "SEO agent",
  l2_autonomy: "L2 auto-queue",
  creative: "Grok Imagine creatives",
  cmo_chat: "CMO chat",
};

export function minTierForFeature(feature: FeatureKey): EntitlementTier {
  return FEATURE_MIN_TIER[feature];
}

export function tierMeets(current: EntitlementTier, min: EntitlementTier): boolean {
  return TIER_RANK[current] >= TIER_RANK[min];
}

export function canUseFeature(
  tier: EntitlementTier,
  feature: FeatureKey,
): boolean {
  return tierMeets(tier, FEATURE_MIN_TIER[feature]);
}

export type FeatureAccessMap = Record<
  FeatureKey,
  { allowed: boolean; min_tier: EntitlementTier; min_label: string; label: string }
>;

export function buildFeatureAccess(tier: EntitlementTier): FeatureAccessMap {
  const out = {} as FeatureAccessMap;
  for (const key of Object.keys(FEATURE_MIN_TIER) as FeatureKey[]) {
    const min = FEATURE_MIN_TIER[key];
    out[key] = {
      allowed: canUseFeature(tier, key),
      min_tier: min,
      min_label: publicLabelForTier(min),
      label: FEATURE_LABEL[key],
    };
  }
  return out;
}

export async function assertFeature(
  ownerId: string,
  feature: FeatureKey,
): Promise<
  | { ok: true; tier: EntitlementTier }
  | { ok: false; response: NextResponse }
> {
  const tier = await resolveEffectiveTier(ownerId);
  if (canUseFeature(tier, feature)) {
    return { ok: true, tier };
  }
  const min = FEATURE_MIN_TIER[feature];
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: `${FEATURE_LABEL[feature]} requires ${publicLabelForTier(min)} or higher (you’re on ${publicLabelForTier(tier)}).`,
        code: "FEATURE_GATED",
        feature,
        feature_label: FEATURE_LABEL[feature],
        tier,
        tier_label: publicLabelForTier(tier),
        min_tier: min,
        min_label: publicLabelForTier(min),
        upgrade: "/pricing",
      },
      { status: 403 },
    ),
  };
}
