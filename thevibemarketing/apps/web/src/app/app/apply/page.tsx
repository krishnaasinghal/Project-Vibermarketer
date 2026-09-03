"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { DOGFOOD_OPERATOR } from "@/content/dogfood-operator";
import { demoDefaultsEnabled } from "@/lib/demo";
import { readJsonSafe } from "@/lib/safe-json";

const DEMO = demoDefaultsEnabled();

type FirstPass = {
  pass: boolean;
  reasons: string[];
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

export default function ApplyPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [founderId, setFounderId] = useState<string | null>(null);
  const [firstPass, setFirstPass] = useState<FirstPass | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus("Submitting…");
    setFirstPass(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const deckUrl = String(fd.get("deck_url") || "").trim();
    const file = fd.get("deck_file");
    const hasFile =
      file && typeof file === "object" && "size" in file && (file as File).size > 0;
    if (!deckUrl && !hasFile) {
      setStatus("Provide a deck URL or upload a PDF");
      setSubmitting(false);
      return;
    }
    if (hasFile) {
      const f = file as File;
      if (f.size > 8 * 1024 * 1024) {
        setStatus("Deck file must be under 8MB");
        setSubmitting(false);
        return;
      }
      if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        setStatus("Deck upload must be a PDF");
        setSubmitting(false);
        return;
      }
    }

    try {
      // Prefer deck URL alone — large PDFs hit Vercel 413 body limits.
      if (deckUrl && hasFile) {
        fd.delete("deck_file");
      }
      const res = await fetch("/api/apply", {
        method: "POST",
        body: fd,
      });
      const { data, parseError } = await readJsonSafe<{
        error?: string;
        founder_id?: string;
        note?: string;
        first_pass?: FirstPass;
        ok?: boolean;
        deck_uploaded?: boolean;
      }>(res);
      if (data?.first_pass) setFirstPass(data.first_pass);
      if ((!res.ok || res.status === 413) && !data?.founder_id) {
        setStatus(
          data?.error ||
            (res.status === 413
              ? "Upload too large for serverless — use a deck URL (PDF link) instead of a local file."
              : parseError
                ? `Submit failed: ${parseError}`
                : "Submit failed"),
        );
        return;
      }
      setFounderId(data?.founder_id ?? null);
      setStatus(
        data?.note ||
          (data?.deck_uploaded
            ? "Application received (deck uploaded)"
            : "Application received"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="section-label mb-2">Inbound</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Apply for a $100K check
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Minimum bar: company name + materials (product site URL, deck link, or
        PDF upload). Add a GitHub handle so cold-start gravity can score public
        pull — without it, compare stays near-zero until you enrich.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 max-w-lg space-y-4">
        <div>
          <label htmlFor="company_name" className="mb-1 block text-sm text-muted">
            Company name
          </label>
          <input
            id="company_name"
            name="company_name"
            required
            className="input-field focus-ring"
            placeholder="Acme Labs"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.product.company : undefined}
          />
        </div>
        <div>
          <label htmlFor="deck_url" className="mb-1 block text-sm text-muted">
            Deck or product URL
          </label>
          <input
            id="deck_url"
            name="deck_url"
            type="url"
            className="input-field focus-ring"
            placeholder="https://yoursite.com or DocSend / Drive PDF"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.portfolio_url : undefined}
          />
        </div>
        <div>
          <label htmlFor="deck_file" className="mb-1 block text-sm text-muted">
            Or upload deck (PDF)
          </label>
          <input
            id="deck_file"
            name="deck_file"
            type="file"
            accept=".pdf,application/pdf"
            className="input-field focus-ring text-sm file:mr-3 file:border-0 file:bg-accent/20 file:px-3 file:py-1 file:text-accent"
          />
          <p className="mt-1 text-xs text-muted">
            Product sites (e.g. your SaaS homepage) are accepted as materials.
            Direct PDF deck URLs (DocSend / Drive / Dropbox) preferred when you
            have one. Local PDF uploads go to private Supabase Storage when
            configured — if both URL and file are set, only the URL is used
            (avoids serverless size limits).
          </p>
        </div>
        <div>
          <label htmlFor="founder_name" className="mb-1 block text-sm text-muted">
            Founder name
          </label>
          <input
            id="founder_name"
            name="founder_name"
            className="input-field focus-ring"
            placeholder="Founder name"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.name : undefined}
          />
        </div>
        <div>
          <label htmlFor="github" className="mb-1 block text-sm text-muted">
            GitHub username{" "}
            <span className="text-accent">(recommended · cold-start)</span>
          </label>
          <input
            id="github"
            name="github"
            className="input-field focus-ring font-mono text-sm"
            placeholder="Anand-0037"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.github_login : undefined}
            autoComplete="username"
          />
          <p className="mt-1 text-xs text-muted">
            Public footprint feeds distribution gravity (stars, followers,
            velocity). Brief Area of Research #3 — not pedigree.
          </p>
        </div>
        <div>
          <label htmlFor="x_handle" className="mb-1 block text-sm text-muted">
            X / Twitter (optional)
          </label>
          <input
            id="x_handle"
            name="x_handle"
            className="input-field focus-ring font-mono text-sm"
            placeholder="AnandVashisht15"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.x_handle : undefined}
          />
        </div>
        <div>
          <label htmlFor="oneliner" className="mb-1 block text-sm text-muted">
            One-liner
          </label>
          <input
            id="oneliner"
            name="oneliner"
            required
            className="input-field focus-ring"
            placeholder="One sentence on what you build"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.product.oneliner : undefined}
          />
        </div>
        <div>
          <label htmlFor="sector" className="mb-1 block text-sm text-muted">
            Sector
          </label>
          <input
            id="sector"
            name="sector"
            className="input-field focus-ring"
            placeholder="AI marketing"
            defaultValue={DEMO ? DOGFOOD_OPERATOR.product.sector : undefined}
          />
        </div>
        <button
          type="submit"
          className="btn-primary focus-ring"
          disabled={submitting}
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </form>

      {firstPass ? (
        <div
          className={`panel mt-6 max-w-lg p-4 ${
            firstPass.pass ? "border-ok/40" : "border-danger/40"
          }`}
          role="status"
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
            First-pass {firstPass.pass ? "PASS" : "FAIL"}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {firstPass.checks.map((c) => (
              <li key={c.name}>
                {c.ok ? "✓" : "✗"} {c.name}: {c.detail}
              </li>
            ))}
          </ul>
          {!firstPass.pass ? (
            <p className="mt-2 text-sm text-danger">
              {firstPass.reasons.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="mt-4 text-sm text-ok" role="status">
          {status}
        </p>
      ) : null}
      {founderId ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/app/founders/${encodeURIComponent(founderId)}`}
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          >
            Open profile
          </Link>
          <Link
            href={`/app/founders/${encodeURIComponent(founderId)}?screen=1&open_memo=1`}
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
          >
            Run 3-axis screen (open memo)
          </Link>
          <Link
            href="/app/radar"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          >
            Back to radar
          </Link>
        </div>
      ) : null}
    </div>
  );
}
