/**
 * Soft + hard run meters by plan tier.
 * Burst limit (per minute) + monthly generation cap (durable in marketing_state).
 * Never unlimited LLM — see pricing-financials packaging rules.
 */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { currentOwnerId } from "@/lib/brand-memory-context";
import { getMarketingStore } from "@/lib/marketing-store";
import {
  getEntitlement,
  isPaidActive,
  publicLabelForTier,
  type EntitlementTier,
} from "@/lib/payments/entitlements";

/** Monthly generation budget (brand extract, drafts, agents, campaign, chat, creative). */
export const MONTHLY_GENERATION_LIMITS: Record<EntitlementTier, number> = {
  free: 25,
  solo: 120, // Starter
  startup: 400, // Growth
  pro: 1000,
  fleet: 5000,
};

export type GenerationKind =
  | "brand"
  | "draft"
  | "campaign"
  | "reddit"
  | "hn"
  | "seo"
  | "chat"
  | "creative"
  | "loop"
  | "other";

export type RunMeterSnapshot = {
  tier: EntitlementTier;
  label: string;
  active_paid: boolean;
  period: string;
  used: number;
  limit: number;
  remaining: number;
  by_kind: Record<string, number>;
};

export async function resolveEffectiveTier(
  ownerId: string,
): Promise<EntitlementTier> {
  if (!ownerId || ownerId === "anonymous" || ownerId === "local-bypass") {
    return "free";
  }
  const ent = await getEntitlement(ownerId);
  if (ent && isPaidActive(ent)) return ent.tier;
  return "free";
}

export async function getRunMeterSnapshot(
  ownerId?: string,
): Promise<RunMeterSnapshot> {
  const id = ownerId ?? currentOwnerId();
  const tier = await resolveEffectiveTier(id);
  const store = getMarketingStore();
  const usage = await store.getUsage();
  const limit = MONTHLY_GENERATION_LIMITS[tier] ?? MONTHLY_GENERATION_LIMITS.free;
  const used = usage.generations;
  return {
    tier,
    label: publicLabelForTier(tier),
    active_paid: tier !== "free",
    period: usage.period,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    by_kind: usage.by_kind,
  };
}

/**
 * Burst (per-minute) + monthly hard cap.
 * Call before expensive work; call recordGeneration on success.
 */
export async function assertGenerationBudget(
  ownerId: string,
  kind: GenerationKind = "other",
): Promise<
  | { ok: true; meter: RunMeterSnapshot }
  | { ok: false; response: NextResponse }
> {
  // 1) Burst — protects a single warm instance
  const burst = checkRateLimit(
    `marketing-expensive:${ownerId || "anon"}`,
    12,
    60_000,
  );
  if (!burst.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Too many generation requests. Retry in ${burst.retryAfterSec}s.`,
          retry_after_seconds: burst.retryAfterSec,
          code: "BURST_LIMIT",
        },
        {
          status: 429,
          headers: { "Retry-After": String(burst.retryAfterSec) },
        },
      ),
    };
  }

  // 2) Monthly meter
  const meter = await getRunMeterSnapshot(ownerId);
  if (meter.used >= meter.limit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Monthly agent budget reached (${meter.used}/${meter.limit} on ${meter.label} for ${meter.period}). Upgrade for more runs.`,
          code: "MONTHLY_METER",
          meter,
          upgrade: "/pricing",
          kind,
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, meter };
}

/** Persist +1 generation after a successful expensive op. */
export async function recordGeneration(
  kind: GenerationKind,
  n = 1,
): Promise<RunMeterSnapshot> {
  const store = getMarketingStore();
  await store.incrementUsage(kind, n);
  return getRunMeterSnapshot();
}

/**
 * Drop-in replacement for checkMarketingExpensiveLimit:
 * burst + monthly meter, returns NextResponse on fail.
 */
export async function checkMarketingExpensiveLimit(
  ownerId: string,
  kind: GenerationKind = "other",
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const result = await assertGenerationBudget(ownerId, kind);
  if (!result.ok) return result;
  return { ok: true };
}
