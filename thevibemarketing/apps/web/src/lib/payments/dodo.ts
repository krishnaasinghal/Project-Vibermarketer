/**
 * Dodo Payments skeleton — Checkout Sessions API.
 * Docs: https://docs.dodopayments.com/api-reference/checkout-sessions/create
 *
 * Checkout is unavailable until DODO_PAYMENTS_API_KEY + product IDs are live.
 */

export type BillingTier = "solo" | "startup";

const DODO_API =
  process.env.DODO_PAYMENTS_ENV === "live"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";

export function dodoConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY?.trim());
}

export function productIdForTier(tier: BillingTier): string | null {
  if (tier === "solo") {
    return process.env.DODO_PRODUCT_ID_SOLO?.trim() || null;
  }
  return process.env.DODO_PRODUCT_ID_STARTUP?.trim() || null;
}

export function billingReady(tier: BillingTier): boolean {
  return dodoConfigured() && Boolean(productIdForTier(tier));
}

export type CheckoutResult =
  | { ok: true; checkout_url: string; session_id?: string }
  | { ok: false; error: string };

export async function createDodoCheckout(opts: {
  tier: BillingTier;
  email?: string;
  name?: string;
  /** Supabase auth user id — stamped into metadata for webhook entitlement grant. */
  ownerId?: string;
  returnUrl: string;
}): Promise<CheckoutResult> {
  const key = process.env.DODO_PAYMENTS_API_KEY?.trim();
  const productId = productIdForTier(opts.tier);
  if (!key || !productId) {
    return {
      ok: false,
      error: "Dodo billing is not configured",
    };
  }

  try {
    const body: Record<string, unknown> = {
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: opts.returnUrl,
      metadata: {
        tier: opts.tier,
        product: "vibemarketer",
        // Public name for ops / webhooks
        plan_label: opts.tier === "solo" ? "starter" : "growth",
        ...(opts.ownerId ? { owner_id: opts.ownerId } : {}),
      },
    };
    if (opts.email) {
      body.customer = {
        email: opts.email,
        ...(opts.name ? { name: opts.name } : {}),
      };
    }

    const res = await fetch(`${DODO_API}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await res.json()) as {
      checkout_url?: string;
      session_id?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok || !data.checkout_url) {
      return {
        ok: false,
        error:
          data.message ||
          data.error ||
          `Dodo checkout HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      checkout_url: data.checkout_url,
      session_id: data.session_id,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Dodo checkout failed",
    };
  }
}
