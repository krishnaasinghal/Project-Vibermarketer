"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

const EXAMPLES = [
  "technical founder, Berlin, AI infra, enterprise traction, no prior VC backing",
  "technical founder, AI infra, no prior VC backing",
  "enterprise traction, developer tools, pre-seed",
  "hidden gem distribution gravity",
  "accelerator YC bootstrapped",
];

type Hit = {
  founder: { id: string; name: string; founder_score: number; bio?: string };
  product?: { name: string; sector?: string } | null;
  score: number;
  matched_terms: string[];
  filter_hits: string[];
};

function FilterChips({ filters }: { filters: Record<string, unknown> }) {
  const chips = Object.entries(filters).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && v !== false,
  );
  if (chips.length === 0) {
    return (
      <p className="mt-4 font-mono text-[10px] text-muted">No structured filters parsed</p>
    );
  }
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Parsed filters">
      {chips.map(([k, v]) => (
        <li
          key={k}
          className="border border-line px-2 py-1 font-mono text-[10px] text-muted"
        >
          <span className="text-accent">{k}</span>{" "}
          {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </li>
      ))}
    </ul>
  );
}

export default function QueryPage() {
  const [q, setQ] = useState(EXAMPLES[0]!);
  const [hits, setHits] = useState<Hit[]>([]);
  const [filters, setFilters] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (query: string) => {
    setBusy(true);
    setError(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", query);
      window.history.replaceState({}, "", url.toString());

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
      });
      const data = (await res.json()) as {
        error?: string;
        hits?: Hit[];
        filters?: Record<string, unknown>;
      };
      if (!res.ok) throw new Error(data.error || "Query failed");
      setHits(data.hits ?? []);
      setFilters(data.filters ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
      setHits([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("q");
    if (fromUrl?.trim()) {
      setQ(fromUrl);
      void run(fromUrl);
    }
  }, [run]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(q);
  }

  return (
    <div>
      <p className="section-label mb-2">Multi-attribute reasoning</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Natural-language query
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Beyond keyword search — compound filters in one pass. Example:
        technical founder, Berlin, AI infra, enterprise traction, no prior VC.
      </p>

      <form onSubmit={onSubmit} className="mt-8 max-w-2xl space-y-3">
        <textarea
          className="input-field focus-ring min-h-[88px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Query"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="btn-ghost focus-ring !px-2 !py-1 text-xs"
              disabled={busy}
              onClick={() => {
                setQ(ex);
                void run(ex);
              }}
            >
              {ex.length > 36 ? `${ex.slice(0, 36)}…` : ex}
            </button>
          ))}
        </div>
        <button type="submit" className="btn-primary focus-ring" disabled={busy}>
          {busy ? "Searching…" : "Run query"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {filters ? <FilterChips filters={filters} /> : null}

      <ul className="mt-8 space-y-2" aria-label="Query hits">
        {hits.map((h) => (
          <li key={h.founder.id}>
            <Link
              href={`/app/founders/${encodeURIComponent(h.founder.id)}`}
              className="panel focus-ring flex flex-col gap-1 p-4 hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-display font-semibold">{h.founder.name}</p>
                <p className="text-sm text-muted">
                  {h.product?.name ?? "No product"}
                  {h.product?.sector ? ` · ${h.product.sector}` : ""}
                </p>
                <p className="mt-1 font-mono text-[10px] text-accent">
                  terms [{h.matched_terms.join(", ")}] · filters [
                  {h.filter_hits.join(", ")}]
                </p>
              </div>
              <div className="font-mono text-sm tabular-nums text-muted">
                match {h.score.toFixed(1)} · FS {h.founder.founder_score.toFixed(0)}
              </div>
            </Link>
          </li>
        ))}
        {!busy && hits.length === 0 ? (
          <li className="panel p-6 text-center">
            <p className="text-sm text-muted">
              No hits — Identify founders on Radar (or inbound Apply), then re-run.
            </p>
            <Link
              href="/app/radar"
              className="btn-primary focus-ring mt-4 inline-block !px-3 !py-1.5 text-sm"
            >
              Open radar
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
