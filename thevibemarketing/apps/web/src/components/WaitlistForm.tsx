"use client";

import { FormEvent, useState } from "react";
import { DOGFOOD_OPERATOR } from "@/content/dogfood-operator";
import { demoDefaultsEnabled } from "@/lib/demo";
import { readJsonSafe } from "@/lib/safe-json";

type Props = {
  source?: "waitlist" | "newsletter" | "pricing" | "blog";
  /** Compact single-row layout (homepage). */
  compact?: boolean;
  cta?: string;
  showName?: boolean;
};

export function WaitlistForm({
  source = "waitlist",
  compact = false,
  cta,
  showName = false,
}: Props) {
  const [done, setDone] = useState(false);
  const [deduped, setDeduped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const buttonLabel =
    cta ||
    (source === "newsletter"
      ? "Subscribe"
      : source === "pricing"
        ? "Email me when billing opens"
        : "Email me drops");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const name = String(fd.get("name") || "").trim();
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, name: name || undefined, source }),
      });
      const { data, parseError } = await readJsonSafe<{
        ok?: boolean;
        error?: string;
        deduped?: boolean;
      }>(res);
      if (!res.ok) {
        throw new Error(
          data?.error ||
            (parseError
              ? `Subscribe failed (${res.status}): ${parseError}`
              : `Subscribe failed (${res.status})`),
        );
      }
      if (!data) throw new Error("Subscribe failed — empty server response");
      setDeduped(Boolean(data.deduped));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-6 text-sm text-ok" role="status">
        {deduped
          ? "You're already on the list — we'll email when a seat opens."
          : source === "newsletter"
            ? "Subscribed. Distribution notes land in your inbox — no spam."
            : "You're on the list. We'll reach out when a seat opens."}
      </p>
    );
  }

  return (
    <form
      className="mt-8 max-w-lg space-y-3"
      onSubmit={(e) => void onSubmit(e)}
    >
      {showName ? (
        <div>
          <label htmlFor={`${source}-name`} className="sr-only">
            Name
          </label>
          <input
            id={`${source}-name`}
            name="name"
            type="text"
            placeholder="Name (optional)"
            defaultValue={
              demoDefaultsEnabled() ? DOGFOOD_OPERATOR.name : undefined
            }
            className="input-field focus-ring w-full"
            autoComplete="name"
            disabled={busy}
            maxLength={80}
          />
        </div>
      ) : null}
      <div
        className={
          compact
            ? "flex flex-col gap-3 sm:flex-row"
            : "flex flex-col gap-3"
        }
      >
        <label htmlFor={`${source}-email`} className="sr-only">
          Email
        </label>
        <input
          id={`${source}-email`}
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          defaultValue={
            demoDefaultsEnabled() ? DOGFOOD_OPERATOR.email : undefined
          }
          className="input-field focus-ring w-full"
          autoComplete="email"
          disabled={busy}
        />
        <button
          type="submit"
          className="btn-primary focus-ring shrink-0"
          disabled={busy}
        >
          {busy ? "Saving…" : buttonLabel}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
