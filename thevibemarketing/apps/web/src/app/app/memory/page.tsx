"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type MemoryState = {
  configured: boolean;
  brand: {
    name: string;
    url: string;
    never_say?: string[];
    facts?: BrandFact[];
    memory?: {
      container_tag: string;
      last_synced_at: string;
      fact_count: number;
    } | null;
  } | null;
  containerTag?: string;
  task?: string;
  coreLines?: string[];
  contextLines?: string[];
  staticFacts?: string[];
  dynamicFacts?: string[];
  layers?: { core: number; static: number; dynamic: number; search: number };
  architecture?: {
    source_of_truth?: string;
    retrieval?: string;
    multi_tenant?: boolean;
  };
  hits?: Array<{ id: string; text: string; similarity?: number; kind: string }>;
  live?: boolean;
  note?: string;
};

type BrandFact = {
  id: string;
  label: string;
  value: string;
  source: "firecrawl" | "tavily" | "human" | "system";
  evidence_url?: string | null;
  confidence?: number | null;
  status: "pending" | "verified" | "rejected";
  note?: string | null;
  verified_at?: string | null;
};

const TASKS = [
  { id: "general", label: "General" },
  { id: "draft_x", label: "Draft X" },
  { id: "draft_linkedin", label: "Draft LinkedIn" },
  { id: "draft_reddit", label: "Draft Reddit" },
  { id: "campaign", label: "Campaign" },
  { id: "reject_review", label: "Reject learnings" },
] as const;

export default function MemoryPage() {
  const [state, setState] = useState<MemoryState | null>(null);
  const [q, setQ] = useState("brand tone and ICP");
  const [task, setTask] = useState<string>("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [episodeText, setEpisodeText] = useState("");
  const [episodeBusy, setEpisodeBusy] = useState(false);

  const load = useCallback(async (query?: string, taskId?: string) => {
    setError(null);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (taskId) params.set("task", taskId);
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`/api/marketing/memory${qs}`);
    const data = (await res.json()) as MemoryState & { error?: string };
    if (!res.ok) {
      setError(data.error || "Failed to load memory");
      return;
    }
    setState(data);
  }, []);

  useEffect(() => {
    void load(undefined, task);
  }, [load, task]);

  async function sync() {
    setBusy(true);
    setBanner(null);
    setError(null);
    try {
      const res = await fetch("/api/marketing/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, task }),
      });
      const data = (await res.json()) as {
        error?: string;
        live?: boolean;
        sync?: { factCount?: number; containerTag?: string; error?: string };
      };
      if (!res.ok) {
        setError(data.error || "Sync failed");
        return;
      }
      setBanner(
        data.live
          ? `Synced ${data.sync?.factCount ?? 0} facts → ${data.sync?.containerTag}`
          : data.sync?.error || "Sync finished offline",
      );
      await load(q, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function writeEpisode() {
    const text = episodeText.trim();
    if (!text) {
      setError("Write a note first (e.g. voice rule or channel tip).");
      return;
    }
    setEpisodeBusy(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/marketing/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episode: { kind: "user_note", text },
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        episode?: { ok?: boolean; error?: string };
      };
      if (!res.ok) {
        setError(data.error || "Episode write failed");
        return;
      }
      if (data.episode && data.episode.ok === false) {
        setError(data.episode.error || "Episode write failed");
        return;
      }
      setBanner("Note saved to episodic brand memory.");
      setEpisodeText("");
      await load(q, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Episode write failed");
    } finally {
      setEpisodeBusy(false);
    }
  }

  async function updateFact(
    factId: string,
    status: BrandFact["status"],
    note?: string,
  ) {
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/marketing/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, status, note }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Fact update failed");
        return;
      }
      setBanner(
        status === "verified"
          ? "Fact verified and synced into trusted brand memory."
          : status === "rejected"
            ? "Fact rejected and excluded from trusted brand memory."
            : "Fact moved back to pending review.",
      );
      await load(q, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fact update failed");
    }
  }

  return (
    <div>
      <p className="section-label mb-2">Persistent memory</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Brand memory
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Layered brand memory: structured brand in Supabase is source of truth;
        SuperMemory is the multi-tenant retrieval index (core + semantic +
        episodic from HITL). Isolation is per workspace owner — not brand name
        alone.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {banner ? (
        <p className="mt-4 text-sm text-ok" role="status">
          {banner}
        </p>
      ) : null}

      {!state ? (
        <p className="mt-8 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-8 space-y-6">
          {!state.brand ? (
            <div className="panel border-accent/40 p-6 sm:p-8">
              <p className="section-label mb-2 text-accent">Start here</p>
              <h2 className="font-display text-xl font-semibold">
                No brand memory yet
              </h2>
              <p className="mt-2 max-w-lg text-sm text-muted">
                Paste your product URL in onboarding. We extract ICP, tone, and
                pillars, then sync a multi-tenant SuperMemory container so
                drafts stay on-voice.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/app/onboarding"
                  className="btn-primary focus-ring inline-flex !px-3 !py-1.5 text-sm"
                >
                  Onboard brand
                </Link>
                <Link
                  href="/app/cmo"
                  className="btn-ghost focus-ring inline-flex !px-3 !py-1.5 text-sm"
                >
                  CMO desk
                </Link>
              </div>
            </div>
          ) : null}

          <div className="panel p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              Status
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">SUPERMEMORY_API_KEY</dt>
                <dd className="font-mono text-ink">
                  {state.configured
                    ? "configured · live path"
                    : "unset · offline"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Container (multi-tenant)</dt>
                <dd className="break-all font-mono text-ink">
                  {state.containerTag ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Layers</dt>
                <dd className="font-mono text-ink">
                  {state.layers
                    ? `core ${state.layers.core} · static ${state.layers.static} · dynamic ${state.layers.dynamic} · search ${state.layers.search}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">SoT / retrieval</dt>
                <dd className="font-mono text-xs text-ink">
                  {state.architecture?.source_of_truth ?? "—"} →{" "}
                  {state.architecture?.retrieval ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Local brand</dt>
                <dd className="text-ink">
                  {state.brand ? (
                    <a
                      href={state.brand.url}
                      className="focus-ring text-accent hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {state.brand.name}
                    </a>
                  ) : (
                    "none"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Recall</dt>
                <dd className={state.live ? "text-ok" : "text-warn"}>
                  {state.live ? "live hits" : "empty / offline"}
                </dd>
              </div>
              {state.brand?.memory?.last_synced_at ? (
                <div>
                  <dt className="text-muted">Last SM sync</dt>
                  <dd className="font-mono text-xs text-ink">
                    {state.brand.memory.last_synced_at.slice(0, 19)} ·{" "}
                    {state.brand.memory.fact_count} facts
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-xs text-muted">{state.note}</p>
          </div>

          {state.brand ? (
            <>
              {state.brand.facts && state.brand.facts.length > 0 ? (
                <section className="panel p-4" aria-label="Brand fact review">
                  <p className="section-label mb-2">HITL fact review</p>
                  <p className="mb-4 text-xs text-muted">
                    Pending facts come from the submitted URL and relevant web
                    searches. Only verified facts become trusted prompt memory.
                  </p>
                  <ul className="space-y-3">
                    {state.brand.facts.map((fact) => (
                      <li
                        key={fact.id}
                        className="rounded-lg border border-line p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
                              {fact.label} · {fact.source} · {fact.status}
                            </p>
                            <p className="mt-1 text-sm text-ink">
                              {fact.value}
                            </p>
                            {fact.evidence_url ? (
                              <a
                                href={fact.evidence_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex break-all text-xs text-accent hover:underline"
                              >
                                Evidence
                              </a>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-ghost focus-ring !px-2.5 !py-1.5 text-xs"
                              disabled={fact.status === "verified"}
                              onClick={() => void updateFact(fact.id, "verified")}
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              className="btn-ghost focus-ring !px-2.5 !py-1.5 text-xs"
                              disabled={fact.status === "rejected"}
                              onClick={() => void updateFact(fact.id, "rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted">
                  Recall task
                  <select
                    className="input-field focus-ring font-mono text-sm text-ink"
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    aria-label="Recall task"
                  >
                    {TASKS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="input-field focus-ring min-w-[200px] flex-1 font-mono text-sm"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Memory query"
                  placeholder="brand tone and ICP"
                />
                <button
                  type="button"
                  className="btn-ghost focus-ring"
                  disabled={busy}
                  onClick={() => void load(q, task)}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="btn-primary focus-ring"
                  disabled={busy || !state.brand}
                  onClick={() => void sync()}
                >
                  {busy ? "Syncing…" : "Sync brand → Supermemory"}
                </button>
              </div>

              <section className="panel p-4" aria-label="Teach memory">
                <p className="section-label mb-2">Teach the fleet</p>
                <p className="mb-3 text-xs text-muted">
                  Manual episodic notes (same path as HITL reject/approve).
                  Example: “Never use emoji on LinkedIn” or “Reddit replies
                  lead with the problem.”
                </p>
                <textarea
                  className="input-field min-h-[5rem] w-full text-sm"
                  value={episodeText}
                  onChange={(e) => setEpisodeText(e.target.value)}
                  placeholder="Voice rule or channel tip…"
                  aria-label="Episodic memory note"
                />
                <button
                  type="button"
                  className="btn-ghost focus-ring mt-2 !px-3 !py-1.5 text-sm"
                  disabled={episodeBusy}
                  onClick={() => void writeEpisode()}
                >
                  {episodeBusy ? "Saving…" : "Save note → memory"}
                </button>
              </section>
            </>
          ) : null}

          {state.coreLines && state.coreLines.length > 0 ? (
            <section className="panel p-4">
              <p className="section-label mb-3">Core (source of truth)</p>
              <ul className="space-y-2 font-mono text-xs text-muted">
                {state.coreLines.map((f) => (
                  <li key={f} className="break-words">
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.staticFacts && state.staticFacts.length > 0 ? (
            <section className="panel p-4">
              <p className="section-label mb-3">Profile · static (semantic)</p>
              <ul className="space-y-2 text-sm text-muted">
                {state.staticFacts.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.dynamicFacts && state.dynamicFacts.length > 0 ? (
            <section className="panel p-4">
              <p className="section-label mb-3">Profile · dynamic (episodic)</p>
              <ul className="space-y-2 text-sm text-muted">
                {state.dynamicFacts.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.contextLines && state.contextLines.length > 0 ? (
            <section className="panel p-4">
              <p className="section-label mb-3">
                Assembled recall (task: {state.task ?? task})
              </p>
              <ul className="space-y-2 text-sm text-muted">
                {state.contextLines.map((f) => (
                  <li key={f} className="break-words">
                    · {f}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.hits && state.hits.length > 0 ? (
            <section className="panel p-4">
              <p className="section-label mb-3">Search hits</p>
              <ul className="space-y-3">
                {state.hits.map((h) => (
                  <li key={h.id} className="border-b border-line pb-2 text-sm">
                    <span className="font-mono text-[10px] uppercase text-accent">
                      {h.kind}
                      {h.similarity != null
                        ? ` · ${(h.similarity * 100).toFixed(0)}%`
                        : ""}
                    </span>
                    <p className="mt-1 break-words text-muted">{h.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-sm text-muted">
            Drafts in{" "}
            <Link
              href="/app/studio"
              className="focus-ring text-accent hover:underline"
            >
              Studio
            </Link>{" "}
            and the{" "}
            <Link
              href="/app/queue"
              className="focus-ring text-accent hover:underline"
            >
              HITL queue
            </Link>{" "}
            pull this recall automatically when the key is set.
          </p>
        </div>
      )}
    </div>
  );
}
