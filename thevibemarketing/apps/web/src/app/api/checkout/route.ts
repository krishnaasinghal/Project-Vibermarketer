import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  billingReady,
  createDodoCheckout,
  type BillingTier,
} from "@/lib/payments/dodo";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

const TIERS = new Set<BillingTier>(["solo", "startup"]);

/**
 * POST { tier: "solo"|"startup", email?, name? }
 * → { checkout_url } when Dodo is keyed.
 * Stamps authenticated owner_id into Dodo metadata so webhooks can grant entitlements.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tier?: string;
      email?: string;
      name?: string;
    };
    const tier = (body.tier || "").toLowerCase() as BillingTier;
    if (!TIERS.has(tier)) {
      return NextResponse.json(
        { error: "tier must be solo or startup" },
        { status: 400 },
      );
    }

    if (!billingReady(tier)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Billing is not configured for this tier. Set DODO_PAYMENTS_API_KEY + product IDs.",
        },
        { status: 503 },
      );
    }

    // Prefer authenticated user for entitlement linking
    let ownerId: string | undefined;
    let email = body.email?.trim();
    const name = body.name?.trim();
    const auth = await requireUser();
    if (!("error" in auth)) {
      ownerId = auth.user.id;
      email = email || auth.user.email;
    }

    const result = await createDodoCheckout({
      tier,
      email,
      name,
      ownerId,
      returnUrl: siteUrl("/checkout/success"),
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.error },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      checkout_url: result.checkout_url,
      session_id: result.session_id,
      note: ownerId
        ? "Checkout started — plan activates after Dodo webhook, not the success page."
        : "Checkout started without login — webhook will match by email if profile exists.",
    });
  } catch (e) {
    const { reportError } = await import("@/lib/errors");
    await reportError("api/checkout", e);
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "Checkout failed",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    provider: "dodo",
    solo: billingReady("solo"),
    startup: billingReady("startup"),
    webhook: "/api/webhooks/dodo",
    note: "Set DODO_PAYMENTS_API_KEY + DODO_PRODUCT_ID_SOLO / _STARTUP + DODO_PAYMENTS_WEBHOOK_KEY. Entitlements via webhook only.",
  });
}
