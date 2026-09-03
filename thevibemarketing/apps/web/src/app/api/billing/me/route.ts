import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getEntitlement,
  toPublicPlan,
} from "@/lib/payments/entitlements";
import { billingReady, dodoConfigured } from "@/lib/payments/dodo";
import { buildFeatureAccess } from "@/lib/payments/feature-gates";
import {
  getRunMeterSnapshot,
  MONTHLY_GENERATION_LIMITS,
} from "@/lib/payments/run-meters";
import { runWithWorkspaceOwner } from "@/lib/workspace-context";

export const runtime = "nodejs";

/**
 * Current user's paid plan + monthly run meter.
 * Never trust checkout success page alone — this reads billing_entitlements.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const ent = await getEntitlement(auth.user.id);
  const plan = toPublicPlan(ent);

  // Usage lives in owner-scoped marketing_state
  const meter = await runWithWorkspaceOwner(auth.user.id, () =>
    getRunMeterSnapshot(auth.user.id),
  );

  const features = buildFeatureAccess(meter.tier);

  return NextResponse.json({
    ok: true,
    plan,
    meter: {
      period: meter.period,
      used: meter.used,
      limit: meter.limit,
      remaining: meter.remaining,
      by_kind: meter.by_kind,
      tier: meter.tier,
      label: meter.label,
    },
    features,
    limits: MONTHLY_GENERATION_LIMITS,
    billing: {
      provider: "dodo",
      configured: dodoConfigured(),
      solo_ready: billingReady("solo"),
      startup_ready: billingReady("startup"),
    },
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    honest:
      "Plan activates via Dodo webhook only. Features + monthly run meters are tier-gated — never unlimited.",
  });
}
