/**
 * Dodo webhooks follow the Standard Webhooks spec (HMAC SHA256).
 * https://docs.dodopayments.com/developer-resources/webhooks
 * https://github.com/standard-webhooks/standard-webhooks
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function parseSecret(raw: string): Buffer {
  const s = raw.trim();
  // standardwebhooks secrets are often `whsec_<base64>`
  if (s.startsWith("whsec_")) {
    return Buffer.from(s.slice("whsec_".length), "base64");
  }
  // try base64
  try {
    const b = Buffer.from(s, "base64");
    if (b.length >= 16) return b;
  } catch {
    /* fall through */
  }
  return Buffer.from(s, "utf8");
}

/**
 * Verify Standard Webhooks signature.
 * Returns true when valid; false when secret set but invalid.
 * If secret is unset: allow only when allowUnsigned is true (local/dev).
 */
export function verifyDodoWebhook(opts: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string | null | undefined;
  /** When true and no secret, skip verify (local only). */
  allowUnsigned?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const secret = opts.secret?.trim();
  if (!secret) {
    if (opts.allowUnsigned) return { ok: true };
    return {
      ok: false,
      error: "DODO_PAYMENTS_WEBHOOK_KEY unset — refuse unsigned webhooks in production",
    };
  }

  if (!opts.webhookId || !opts.webhookTimestamp || !opts.webhookSignature) {
    return { ok: false, error: "missing webhook-id / webhook-timestamp / webhook-signature" };
  }

  // Reject stale timestamps (> 5 minutes) to reduce replay risk
  const ts = Number(opts.webhookTimestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, error: "invalid webhook-timestamp" };
  }
  const skewSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skewSec > 300) {
    return { ok: false, error: "webhook timestamp outside allowed skew" };
  }

  const signedContent = `${opts.webhookId}.${opts.webhookTimestamp}.${opts.rawBody}`;
  const key = parseSecret(secret);
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  // Header may be "v1,<sig>" or multiple space-separated "v1,sig"
  const candidates = opts.webhookSignature
    .split(" ")
    .map((part) => {
      const p = part.trim();
      if (p.startsWith("v1,")) return p.slice(3);
      return p;
    })
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  for (const cand of candidates) {
    try {
      const candBuf = Buffer.from(cand);
      if (
        candBuf.length === expectedBuf.length &&
        timingSafeEqual(candBuf, expectedBuf)
      ) {
        return { ok: true };
      }
    } catch {
      /* continue */
    }
  }

  return { ok: false, error: "webhook signature mismatch" };
}
