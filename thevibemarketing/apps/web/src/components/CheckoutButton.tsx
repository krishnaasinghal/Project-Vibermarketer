"use client";

import { useState } from "react";

type Props = {
  tier: "solo" | "startup";
  label: string;
  highlight?: boolean;
};

/**
 * Starts a real Dodo checkout when billing is configured.
 * Plan activates only after webhook → billing_entitlements (not success URL).
 */
export function CheckoutButton({ tier, label, highlight }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        checkout_url?: string;
        message?: string;
      };
      if (data.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setNote(data.message || "Checkout is currently unavailable.");
    } catch {
      setNote("Checkout is currently unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className={`focus-ring w-full text-center ${
          highlight ? "btn-primary" : "btn-ghost"
        }`}
      >
        {busy ? "Starting checkout…" : label}
      </button>
      {note ? (
        <p className="text-center text-xs text-muted">{note}</p>
      ) : (
        <p className="text-center text-xs text-muted">
          Sign in before checkout so we can link your plan. Access unlocks after
          payment webhook — not the thank-you page.
        </p>
      )}
    </div>
  );
}
