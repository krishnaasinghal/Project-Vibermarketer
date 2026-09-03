"use client";

import { useEffect, useState } from "react";
import { readJsonSafe } from "@/lib/safe-json";

type ChannelStat = {
  source: string;
  count: number;
  avg_stars: number;
  avg_hn: number;
  founders_touched: number;
  avg_founder_score?: number;
  yes_decisions?: number;
  rank_score: number;
};

type ChannelIntelData = {
  channels: ChannelStat[];
  underexplored: string[];
  tip: string;
};

export function ChannelIntel() {
  const [data, setData] = useState<ChannelIntelData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/channels");
        const { data: json } = await readJsonSafe<ChannelIntelData>(res);
        if (!res.ok || !json) {
          throw new Error("Failed to load channel stats");
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="panel mt-10 p-4" aria-label="Sourcing channels">
        <p className="section-label mb-1">Sourcing channels</p>
        <p className="text-sm text-danger">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel mt-10 p-4" aria-label="Sourcing channels">
        <p className="section-label mb-1">Sourcing channels</p>
        <p className="text-sm text-muted">Loading channel intel…</p>
      </section>
    );
  }

  const top = data.channels.slice(0, 8);

  return (
    <section className="panel mt-10 p-4" aria-label="Sourcing channels">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="section-label mb-1">Sourcing channels</p>
          <h2 className="font-display text-lg font-semibold">
            Where founders enter memory
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase text-muted">
          {data.channels.length} sources · {top.reduce((n, c) => n + c.count, 0)} signals
        </span>
      </div>

      {top.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No signals yet — run Identify (GitHub / HN / arXiv) to populate channel stats.
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Channel rankings">
          {top.map((c) => (
            <li
              key={c.source}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-1.5 last:border-0"
            >
              <span className="font-mono text-sm text-ink">{c.source}</span>
              <span className="font-mono text-[11px] text-muted">
                n={c.count} · founders {c.founders_touched}
                {typeof c.avg_founder_score === "number"
                  ? ` · FS~${c.avg_founder_score.toFixed(0)}`
                  : ""}
                {c.yes_decisions ? ` · YES ${c.yes_decisions}` : ""} · stars~
                {c.avg_stars.toFixed(0)} · hn~{c.avg_hn.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        Live Identify: github · hackernews · arxiv. Product Hunt / Twitter /
        LinkedIn are not wired — never fabricated.
      </p>

      {data.tip ? (
        <p className="mt-4 text-sm text-muted" role="status">
          <span className="font-mono text-[10px] uppercase text-accent">Tip · </span>
          {data.tip}
        </p>
      ) : null}
    </section>
  );
}
