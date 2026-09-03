/**
 * Dodo Payments webhooks → billing_entitlements.
 * Access is granted here — never from /checkout/success alone.
 *
 * Configure endpoint: https://www.vibemarketer.fun/api/webhooks/dodo
 * Env: DODO_PAYMENTS_WEBHOOK_KEY (Standard Webhooks secret)
 */

import { NextResponse } from "next/server";
import {
  getEntitlementBySubscription,
  markWebhookProcessed,
  resolveOwnerIdByEmail,
  tierFromProductId,
  upsertEntitlement,
  wasWebhookProcessed,
  type EntitlementStatus,
  type EntitlementTier,
} from "@/lib/payments/entitlements";
import { verifyDodoWebhook } from "@/lib/payments/webhook-verify";

export const runtime = "nodejs";
export const maxDuration = 30;

type Json = Record<string, unknown>;

function asObj(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : {};
}

function digString(obj: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // nested metadata / customer
  for (const nest of ["metadata", "customer", "product", "subscription"]) {
    const n = asObj(obj[nest]);
    for (const k of keys) {
      const v = n[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function extractOwnerId(data: Json): string | null {
  const meta = asObj(data.metadata);
  const fromMeta =
    digString(meta, ["owner_id", "user_id", "ownerId", "userId"]) ||
    digString(data, ["owner_id", "user_id"]);
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) return fromMeta;
  if (fromMeta && fromMeta.length > 8 && fromMeta !== "local-bypass") {
    return fromMeta;
  }
  return null;
}

function extractEmail(data: Json): string | null {
  return (
    digString(data, ["email", "customer_email"]) ||
    digString(asObj(data.customer), ["email"]) ||
    null
  );
}

function extractProductId(data: Json): string | null {
  return (
    digString(data, ["product_id", "productId"]) ||
    digString(asObj(data.product), ["product_id", "id"]) ||
    null
  );
}

function extractSubscriptionId(data: Json): string | null {
  return (
    digString(data, ["subscription_id", "subscriptionId"]) ||
    digString(asObj(data.subscription), ["subscription_id", "id"]) ||
    null
  );
}

function extractPaymentId(data: Json): string | null {
  return digString(data, ["payment_id", "paymentId", "id"]);
}

function extractCustomerId(data: Json): string | null {
  return (
    digString(data, ["customer_id", "customerId"]) ||
    digString(asObj(data.customer), ["customer_id", "id"]) ||
    null
  );
}

function extractPeriodEnd(data: Json): string | null {
  return (
    digString(data, [
      "current_period_end",
      "next_billing_date",
      "expires_at",
    ]) || null
  );
}

function extractSubscriptionStatus(data: Json): string | null {
  return digString(data, ["status", "subscription_status", "subscriptionStatus"]);
}

function resolveTier(data: Json): EntitlementTier | null {
  const productId = extractProductId(data);
  const fromProduct = tierFromProductId(productId);
  if (fromProduct) return fromProduct;
  return null;
}

async function resolveOwner(data: Json): Promise<string | null> {
  const direct = extractOwnerId(data);
  if (direct) return direct;
  const email = extractEmail(data);
  if (email) {
    const byEmail = await resolveOwnerIdByEmail(email);
    if (byEmail) return byEmail;
  }
  const subId = extractSubscriptionId(data);
  if (subId) {
    const existing = await getEntitlementBySubscription(subId);
    if (existing?.owner_id) return existing.owner_id;
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");

  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.DODO_WEBHOOK_ALLOW_UNSIGNED === "1";

  const verified = verifyDodoWebhook({
    rawBody,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    secret: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    allowUnsigned,
  });

  if (!verified.ok) {
    console.error("[dodo webhook] verify failed:", verified.error);
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  let body: { type?: string; data?: unknown; business_id?: string };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const eventType = String(body.type || "");
  const data = asObj(body.data);

  // Idempotency
  if (webhookId && (await wasWebhookProcessed(webhookId))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const ownerId = await resolveOwner(data);
  const email = extractEmail(data);
  const productId = extractProductId(data);
  const subscriptionId = extractSubscriptionId(data);
  const paymentId = extractPaymentId(data);
  const customerId = extractCustomerId(data);
  const periodEnd = extractPeriodEnd(data);
  const tier = resolveTier(data);
  const subscriptionStatus = extractSubscriptionStatus(data);

  let handled = false;
  let status: EntitlementStatus | null = null;

  switch (eventType) {
    case "payment.succeeded":
    case "subscription.active":
    case "subscription.renewed":
      status = "active";
      break;
    case "subscription.updated": {
      const normalized = String(subscriptionStatus || "").toLowerCase();
      if (["active", "renewed"].includes(normalized)) {
        status = "active";
      } else if (normalized === "trialing") {
        status = "trialing";
      } else if (["on_hold", "past_due", "paused"].includes(normalized)) {
        status = "past_due";
      } else if (["cancelled", "canceled", "expired", "failed", "inactive"].includes(normalized)) {
        status = "cancelled";
      } else {
        handled = true;
      }
      break;
    }
    case "subscription.on_hold":
      status = "past_due";
      break;
    case "subscription.cancelled":
    case "subscription.expired":
    case "subscription.failed":
      status = "cancelled";
      break;
    case "payment.failed":
    case "payment.cancelled":
      // Do not activate; ignore if no prior entitlement
      status = null;
      handled = true;
      break;
    default:
      // Acknowledge unknown events so Dodo stops retrying
      handled = true;
      break;
  }

  if (status && !tier) {
    console.error("[dodo webhook] unknown product id — entitlement not applied", {
      eventType,
      productId,
      subscriptionId,
    });
    return NextResponse.json(
      {
        error: "Unknown Dodo product id; entitlement not applied.",
        code: "UNKNOWN_PRODUCT",
      },
      { status: 422 },
    );
  }

  if (status && ownerId && tier) {
    const result = await upsertEntitlement({
      ownerId,
      tier,
      status,
      email,
      dodoCustomerId: customerId,
      dodoSubscriptionId: subscriptionId,
      dodoPaymentId: paymentId,
      productId,
      currentPeriodEnd: periodEnd,
      metadata: {
        last_event: eventType,
        business_id: body.business_id ?? null,
      },
    });
    if (!result.ok) {
      console.error("[dodo webhook] upsert failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
    handled = true;
  }

  if (status && !ownerId) {
    console.warn(
      "[dodo webhook] no owner_id/email match — entitlement not applied",
      { eventType, email, subscriptionId },
    );
    return NextResponse.json(
      {
        error: "Could not resolve billing event owner; entitlement not applied.",
        code: "BILLING_OWNER_UNRESOLVED",
      },
      { status: 503 },
    );
  }

  if (webhookId) {
    await markWebhookProcessed({
      webhookId,
      eventType,
      ownerId,
      summary: {
        handled,
        status,
        tier,
        email,
        productId,
        subscriptionId,
        subscriptionStatus,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    handled,
    eventType,
    owner_id: ownerId,
  });
}

/** Health for ops — does not expose secrets. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "dodo",
    webhook_secret_configured: Boolean(
      process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim(),
    ),
    note: "POST payment/subscription events here. Entitlements update only after verified webhook.",
  });
}
