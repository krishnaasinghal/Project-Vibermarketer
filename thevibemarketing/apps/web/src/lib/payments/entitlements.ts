/**
 * Billing entitlements — paid plan truth in Supabase.
 * Grant/revoke only from Dodo webhooks (service role), never from success URL alone.
 */

import { getSupabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase-admin";
import type { BillingTier } from "@/lib/payments/dodo";

export type EntitlementTier = "free" | BillingTier | "pro" | "fleet";
export type EntitlementStatus =
  | "active"
  | "inactive"
  | "past_due"
  | "cancelled"
  | "trialing";

export type Entitlement = {
  owner_id: string;
  tier: EntitlementTier;
  status: EntitlementStatus;
  dodo_customer_id: string | null;
  dodo_subscription_id: string | null;
  dodo_payment_id: string | null;
  product_id: string | null;
  email: string | null;
  current_period_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PublicPlan = {
  tier: EntitlementTier;
  status: EntitlementStatus;
  active: boolean;
  /** Public marketing name */
  label: string;
  current_period_end: string | null;
};

const TIER_LABEL: Record<EntitlementTier, string> = {
  free: "Free",
  solo: "Starter",
  startup: "Growth",
  pro: "Pro",
  fleet: "Fleet",
};

export function publicLabelForTier(tier: EntitlementTier): string {
  return TIER_LABEL[tier] ?? tier;
}

export function isPaidActive(e: Pick<Entitlement, "tier" | "status"> | null): boolean {
  if (!e) return false;
  if (e.tier === "free") return false;
  return e.status === "active" || e.status === "trialing";
}

export function toPublicPlan(
  e: Entitlement | null,
): PublicPlan {
  if (!e) {
    return {
      tier: "free",
      status: "inactive",
      active: false,
      label: "Free",
      current_period_end: null,
    };
  }
  return {
    tier: e.tier,
    status: e.status,
    active: isPaidActive(e),
    label: publicLabelForTier(e.tier),
    current_period_end: e.current_period_end,
  };
}

/** Map Dodo product id → internal tier. */
export function tierFromProductId(productId: string | null | undefined): BillingTier | null {
  if (!productId?.trim()) return null;
  const solo = process.env.DODO_PRODUCT_ID_SOLO?.trim();
  const startup = process.env.DODO_PRODUCT_ID_STARTUP?.trim();
  if (solo && productId === solo) return "solo";
  if (startup && productId === startup) return "startup";
  return null;
}

export function tierFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): BillingTier | null {
  const t = String(meta?.tier || meta?.plan || "").toLowerCase();
  if (t === "solo" || t === "starter") return "solo";
  if (t === "startup" || t === "growth") return "startup";
  return null;
}

export async function getEntitlement(
  ownerId: string,
): Promise<Entitlement | null> {
  if (!hasSupabaseAdmin() || !ownerId || ownerId === "local-bypass") {
    return null;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from("billing_entitlements")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Entitlement;
}

export async function getEntitlementByEmail(
  email: string,
): Promise<Entitlement | null> {
  if (!hasSupabaseAdmin() || !email.trim()) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from("billing_entitlements")
    .select("*")
    .ilike("email", email.trim())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as Entitlement;
}

export async function getEntitlementBySubscription(
  subscriptionId: string,
): Promise<Entitlement | null> {
  if (!hasSupabaseAdmin() || !subscriptionId.trim()) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from("billing_entitlements")
    .select("*")
    .eq("dodo_subscription_id", subscriptionId.trim())
    .maybeSingle();
  if (error || !data) return null;
  return data as Entitlement;
}

export type UpsertEntitlementInput = {
  ownerId: string;
  tier: EntitlementTier;
  status: EntitlementStatus;
  email?: string | null;
  dodoCustomerId?: string | null;
  dodoSubscriptionId?: string | null;
  dodoPaymentId?: string | null;
  productId?: string | null;
  currentPeriodEnd?: string | null;
  metadata?: Record<string, unknown>;
};

export async function upsertEntitlement(
  input: UpsertEntitlementInput,
): Promise<{ ok: true; entitlement: Entitlement } | { ok: false; error: string }> {
  if (!hasSupabaseAdmin()) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY required for entitlements" };
  }
  if (!input.ownerId || input.ownerId === "local-bypass") {
    return { ok: false, error: "valid ownerId required" };
  }
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "no admin client" };

  const row = {
    owner_id: input.ownerId,
    tier: input.tier,
    status: input.status,
    email: input.email ?? null,
    dodo_customer_id: input.dodoCustomerId ?? null,
    dodo_subscription_id: input.dodoSubscriptionId ?? null,
    dodo_payment_id: input.dodoPaymentId ?? null,
    product_id: input.productId ?? null,
    current_period_end: input.currentPeriodEnd ?? null,
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("billing_entitlements")
    .upsert(row, { onConflict: "owner_id" })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "upsert failed" };
  }
  return { ok: true, entitlement: data as Entitlement };
}

/** Resolve auth user id by email (for webhooks that only have customer email). */
export async function resolveOwnerIdByEmail(
  email: string,
): Promise<string | null> {
  if (!hasSupabaseAdmin() || !email.trim()) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  // Prefer profiles table (synced on signup)
  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .ilike("email", email.trim())
    .limit(1)
    .maybeSingle();
  if (profile?.id) return profile.id as string;

  // Fallback: list users is heavy — skip unless needed. Email match on entitlement only.
  return null;
}

export async function markWebhookProcessed(opts: {
  webhookId: string;
  eventType: string;
  ownerId?: string | null;
  summary?: Record<string, unknown>;
}): Promise<boolean> {
  if (!hasSupabaseAdmin() || !opts.webhookId) return false;
  const sb = getSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb.from("billing_webhook_events").upsert(
    {
      webhook_id: opts.webhookId,
      event_type: opts.eventType,
      owner_id: opts.ownerId ?? null,
      payload_summary: opts.summary ?? {},
      processed_at: new Date().toISOString(),
    },
    { onConflict: "webhook_id" },
  );
  return !error;
}

export async function wasWebhookProcessed(webhookId: string): Promise<boolean> {
  if (!hasSupabaseAdmin() || !webhookId) return false;
  const sb = getSupabaseAdmin();
  if (!sb) return false;
  const { data } = await sb
    .from("billing_webhook_events")
    .select("webhook_id")
    .eq("webhook_id", webhookId)
    .maybeSingle();
  return Boolean(data?.webhook_id);
}
