"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BrandContext, Post } from "@/lib/marketing-store";
import { PUBLIC_PRICING_SUMMARY } from "@/content/plans";

type AgentCard = {
  id: string;
  name: string;
  status: string;
  ready: number;
  blurb: string;
  cta: { label: string; href: string; action: string | null };
};

type Doc = {
  id: string;
  title: string;
  status: string;
  body: string;
  href: string;
};

type Scorecard = {
  scores: {
    overall: number;
    seo: number;
    geo: number;
    performance: number;
    a11y: number;
    security: number;
  };
  lighthouse_style: {
    performance: number;
    accessibility: number;
    best_practices: number;
    seo: number;
    note: string;
  };
  recommendations: string[];
  checks: Array<{ id: string; label: string; pass: boolean; category: string }>;
  measured_at: string;
};

type PageSpeed = {
  strategy: string;
  performance: number;
  accessibility: number;
  best_practices: number;
  seo: number;
  lcp_ms: number | null;
  fcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  fetch_error?: string;
};

type Dash = {
  brand: BrandContext | null;
  stats: {
    pending: number;
    queued: number;
    published: number;
  };
  agent_feed: AgentCard[];
  documents: Doc[];
  scorecard: Scorecard | null;
  pagespeed: {
    mobile: PageSpeed | null;
    desktop: PageSpeed | null;
    configured: boolean;
  } | null;
  pagespeed_configured: boolean;
  last_audit: BrandContext["last_audit"];
  cmo_intro: string;
  recent_posts: Post[];
};

function Ring({ value, label }: { value: number; label: string }) {
  const color =
    value >= 90 ? "text-ok" : value >= 50 ? "text-accent" : "text-danger";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`font-display text-3xl font-bold tabular-nums ${color}`}
      >
        {value}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
    </div>
  );
}

function ms(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

export default function CmoDashboardPage() {
  const [wow, setWow] = useState(false);
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditBusy, setAuditBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<Array<{ role: "cmo" | "you"; text: string }>>(
    [],
  );
  const [msg, setMsg] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [compInput, setCompInput] = useState("");
  const [docOpen, setDocOpen] = useState<string | null>("product");
  const [gaBusy, setGaBusy] = useState<string | null>(null);
  const [gaNote, setGaNote] = useState<string | null>(null);
  const [digest, setDigest] = useState<{
    narrative: string;
    checklist: Array<{
      id: string;
      title: string;
      done: boolean;
      detail: string;
      action: { label: string; href: string };
    }>;
  } | null>(null);

  const load = useCallback(async (audit = false) => {
    if (audit) setAuditBusy(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketing/cmo${audit ? "?audit=1" : ""}`,
      );
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error || "Dashboard failed");
      }
      const data = (await res.json()) as Dash;
      setDash(data);
      if (chat.length === 0 && data.cmo_intro) {
        setChat([{ role: "cmo", text: data.cmo_intro }]);
      }
      if (data.brand?.competitors?.length) {
        setCompInput(data.brand.competitors.join("\n"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
      setAuditBusy(false);
    }
  }, [chat.length]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    try {
      setWow(new URLSearchParams(window.location.search).get("wow") === "1");
    } catch {
      setWow(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/marketing/cmo/digest");
        if (!res.ok) return;
        const data = (await res.json()) as {
          narrative: string;
          checklist: Array<{
            id: string;
            title: string;
            done: boolean;
            detail: string;
            action: { label: string; href: string };
          }>;
        };
        setDigest(data);
      } catch {
        /* ignore */
      }
    })();
  }, [dash?.stats.pending, dash?.brand?.name]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = msg.trim();
    if (!text) return;
    setMsg("");
    setChat((c) => [...c, { role: "you", text }]);
    setChatBusy(true);
    try {
      const res = await fetch("/api/marketing/cmo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        suggested_actions?: string[];
      };
      const reply =
        data.reply ||
        data.error ||
        "Something went wrong — try Studio agents.";
      const extras =
        data.suggested_actions?.length
          ? `\n\n→ ${data.suggested_actions.join(" · ")}`
          : "";
      setChat((c) => [...c, { role: "cmo", text: reply + extras }]);
    } catch {
      setChat((c) => [
        ...c,
        { role: "cmo", text: "Network error. Try again." },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function saveCompetitors() {
    const competitors = compInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/marketing/cmo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitors }),
    });
    if (res.ok) await load(false);
  }

  async function connectGoogle(toolkit: "google_analytics" | "google_search_console") {
    setGaBusy(toolkit);
    setGaNote(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await res.json()) as {
        status?: string;
        url?: string;
        message?: string;
        error?: string;
      };
      if (data.status === "ok" && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        setGaNote(
          "Google OAuth opened — finish consent (Analytics/GSC scopes). Finish only if you trust this app; we request read access to improve CMO reports, never invent traffic.",
        );
      } else {
        setGaNote(
          data.message ||
            data.error ||
            "Connect unavailable. In Composio, add a Google Analytics / Search Console auth config, then retry from Connectors.",
        );
      }
    } catch {
      setGaNote("Network error connecting Google.");
    } finally {
      setGaBusy(null);
    }
  }

  async function runAgent(action: string | null) {
    if (!action || action === "queue" || action === "draft") return;
    setError(null);
    try {
      if (action === "audit") {
        await load(true);
        return;
      }
      const path =
        action === "reddit"
          ? "/api/marketing/agents/reddit"
          : action === "hn"
            ? "/api/marketing/agents/hn"
            : action === "seo"
              ? "/api/marketing/agents/seo"
              : null;
      if (!path) return;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enqueue: true }),
      });
      const data = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) throw new Error(data.error || "Agent failed");
      setChat((c) => [
        ...c,
        {
          role: "cmo",
          text: data.note || `${action} agent finished — check HITL queue.`,
        },
      ]);
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent failed");
    }
  }

  if (loading && !dash) {
    return (
      <p className="font-mono text-sm text-muted">
        Loading CMO terminal…
      </p>
    );
  }

  const brand = dash?.brand;
  const sc = dash?.scorecard;
  const psi = dash?.pagespeed;
  const lh = sc?.lighthouse_style;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-label mb-2 text-accent">AI CMO · Terminal</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {brand?.name || "Your CMO desk"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {brand?.oneliner ||
              "Onboard a product URL to unlock brand memory, agent feed, and site health."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            disabled={auditBusy || !brand}
            onClick={() => void load(true)}
          >
            {auditBusy ? "Auditing…" : "Refresh audit"}
          </button>
          <Link
            href="/app/onboarding"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
          >
            {brand ? "Update brand" : "Onboard"}
          </Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {wow && brand ? (
        <div
          className="panel border-ok/40 bg-ok/5 p-4"
          role="status"
        >
          <p className="section-label mb-1 text-ok">First loop live</p>
          <p className="text-sm text-ink">
            Brand memory is set
            {(dash?.stats.pending ?? 0) > 0
              ? ` · ${dash?.stats.pending} draft${dash?.stats.pending === 1 ? "" : "s"} waiting for you`
              : ""}
            . Next: approve in HITL or run an agent.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/queue?wow=1"
              className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            >
              Review HITL queue
            </Link>
            <Link
              href="/app/studio"
              className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            >
              Open Studio agents
            </Link>
          </div>
        </div>
      ) : null}

      {!brand ? (
        <div className="panel border-accent/40 p-6 sm:p-8">
          <p className="section-label mb-2 text-accent">Start here · 60 seconds</p>
          <h2 className="font-display text-xl font-semibold">
            Paste your product URL
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
            We extract brand memory, draft X · LinkedIn · Reddit posts, and put
            them in your approve queue. Nothing posts without you. Same entry as
            a modern AI CMO — built for founder HITL.
          </p>
          <ol className="mt-4 space-y-1 font-mono text-[11px] text-muted">
            <li>1 · Onboard URL → brand voice</li>
            <li>2 · Auto first drafts (or Studio)</li>
            <li>3 · Approve in queue → real publish when connected</li>
          </ol>
          <Link
            href="/app/onboarding"
            className="btn-primary focus-ring mt-5 inline-flex"
          >
            Paste product URL →
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Daily digest — Okara-style “every day I’ll send you” */}
          {digest ? (
            <section className="panel border-accent/30 p-5">
              <p className="section-label mb-2 text-accent">Daily CMO plan</p>
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
                {digest.narrative}
              </pre>
              <ul className="mt-4 space-y-2">
                {digest.checklist.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm"
                  >
                    <div>
                      <span className={c.done ? "text-ok" : "text-ink"}>
                        {c.done ? "✓" : "○"} {c.title}
                      </span>
                      <p className="text-xs text-muted">{c.detail}</p>
                    </div>
                    <Link
                      href={c.action.href}
                      className="font-mono text-[10px] uppercase text-accent hover:underline"
                    >
                      {c.action.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Company + docs */}
          <section className="panel p-5">
            <p className="section-label mb-3">Company</p>
            {brand ? (
              <div className="space-y-3 text-sm">
                <p className="leading-relaxed text-ink">
                  {brand.description || brand.oneliner}
                </p>
                <p className="text-xs text-muted">
                  ICP · {brand.icp} · Tone · {brand.tone}
                </p>
                <a
                  href={brand.url}
                  className="font-mono text-xs text-accent hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {brand.url}
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
            <div className="mt-6">
              <p className="section-label mb-2">Documents</p>
              <div className="flex flex-wrap gap-2">
                {dash?.documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      setDocOpen(docOpen === d.id ? null : d.id)
                    }
                    className={`rounded border px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${
                      docOpen === d.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-muted hover:text-ink"
                    }`}
                  >
                    {d.title}
                    <span className="ml-1 opacity-60">
                      {d.status === "ready" ? "·" : "new"}
                    </span>
                  </button>
                ))}
              </div>
              {docOpen && dash ? (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line bg-bg-elevated p-3 font-mono text-[11px] text-muted">
                  {dash.documents.find((d) => d.id === docOpen)?.body}
                </pre>
              ) : null}
            </div>
          </section>

          {/* Analytics / scores */}
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="section-label">Analytics · SEO · GEO · Technical</p>
              <span className="font-mono text-[10px] text-muted">
                {dash?.last_audit
                  ? `Last audit ${dash.last_audit.at.slice(0, 10)}`
                  : "Not audited yet"}
              </span>
            </div>

            {/* Google services — real OAuth via Composio (not a fake button) */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-line p-3">
                <p className="text-sm font-medium">Google Analytics</p>
                <p className="mt-1 text-xs text-muted">
                  Read-only GA4 traffic · OAuth scopes when auth_config is ready
                </p>
                <button
                  type="button"
                  className="btn-ghost mt-2 !px-2 !py-1 text-xs"
                  disabled={gaBusy !== null}
                  onClick={() => void connectGoogle("google_analytics")}
                >
                  {gaBusy === "google_analytics" ? "Opening…" : "Connect GA"}
                </button>
              </div>
              <div className="rounded border border-line p-3">
                <p className="text-sm font-medium">Search Console</p>
                <p className="mt-1 text-xs text-muted">
                  Queries & coverage · same Google Cloud verification path
                </p>
                <button
                  type="button"
                  className="btn-ghost mt-2 !px-2 !py-1 text-xs"
                  disabled={gaBusy !== null}
                  onClick={() => void connectGoogle("google_search_console")}
                >
                  {gaBusy === "google_search_console" ? "Opening…" : "Connect GSC"}
                </button>
              </div>
            </div>
            {gaNote ? (
              <p className="mt-2 text-xs text-muted" role="status">
                {gaNote}{" "}
                <Link href="/app/connectors" className="text-accent hover:underline">
                  All connectors →
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-[10px] text-muted">
                Yes, products can request GA/GSC access — requires Privacy Policy,
                Terms, Google Cloud OAuth client, and often Google verification for
                sensitive scopes. We never invent metrics if connect fails.
              </p>
            )}

            {/* PageSpeed / Lighthouse */}
            <div className="mt-6">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">
                {psi?.configured
                  ? "PageSpeed (Google Lighthouse)"
                  : "Site health scores"}
              </p>
              {psi?.configured && (psi.mobile || psi.desktop) ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  {(["mobile", "desktop"] as const).map((k) => {
                    const s = psi[k];
                    if (!s) return null;
                    return (
                      <div key={k}>
                        <p className="mb-3 text-xs font-semibold capitalize text-ink">
                          {k}
                          {s.fetch_error ? (
                            <span className="ml-2 text-danger">
                              {s.fetch_error}
                            </span>
                          ) : null}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          <Ring value={s.performance} label="Perf" />
                          <Ring value={s.accessibility} label="A11y" />
                          <Ring value={s.best_practices} label="BP" />
                          <Ring value={s.seo} label="SEO" />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] text-muted">
                          <span>LCP {ms(s.lcp_ms)}</span>
                          <span>FCP {ms(s.fcp_ms)}</span>
                          <span>TBT {ms(s.tbt_ms)}</span>
                          <span>
                            CLS{" "}
                            {s.cls != null ? s.cls.toFixed(3) : "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : lh ? (
                <div>
                  <div className="grid grid-cols-4 gap-3">
                    <Ring value={lh.performance} label="Perf*" />
                    <Ring value={lh.accessibility} label="A11y*" />
                    <Ring value={lh.best_practices} label="BP*" />
                    <Ring value={lh.seo} label="SEO*" />
                  </div>
                  <p className="mt-3 text-[10px] text-muted">{lh.note}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    Set{" "}
                    <code className="text-accent">PAGESPEED_API_KEY</code> for
                    real Google Lighthouse (mobile + desktop).
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Run <strong>Refresh audit</strong> for GEO + heuristic scores.
                </p>
              )}
            </div>

            {sc ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="section-label mb-2">Score breakdown</p>
                  <ul className="space-y-1 font-mono text-xs text-muted">
                    <li>Overall {sc.scores.overall}</li>
                    <li>SEO {sc.scores.seo}</li>
                    <li>GEO {sc.scores.geo}</li>
                    <li>Security {sc.scores.security}</li>
                  </ul>
                </div>
                <div>
                  <p className="section-label mb-2">Top issues</p>
                  <ul className="space-y-1 text-xs text-muted">
                    {sc.recommendations.slice(0, 5).map((r) => (
                      <li key={r}>· {r}</li>
                    ))}
                    {sc.recommendations.length === 0 ? (
                      <li className="text-ok">No major issues flagged</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>

          {/* Agents feed */}
          <section>
            <p className="section-label mb-3">Agents feed</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {dash?.agent_feed.map((a) => (
                <li
                  key={a.id}
                  className="panel flex flex-col gap-2 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-semibold">
                      {a.name}
                    </h3>
                    <span className="font-mono text-[10px] uppercase text-muted">
                      {a.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{a.blurb}</p>
                  <p className="font-mono text-xs text-accent">
                    {a.ready > 0
                      ? `${a.ready} ready in queue`
                      : "No items yet"}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    {a.cta.action &&
                    ["reddit", "hn", "seo", "audit"].includes(a.cta.action) ? (
                      <button
                        type="button"
                        className="btn-primary focus-ring !px-2 !py-1 text-xs"
                        onClick={() => void runAgent(a.cta.action)}
                      >
                        {a.cta.label}
                      </button>
                    ) : (
                      <Link
                        href={a.cta.href}
                        className="btn-ghost focus-ring !px-2 !py-1 text-xs"
                      >
                        {a.cta.label}
                      </Link>
                    )}
                    {a.id === "queue" || a.ready > 0 ? (
                      <Link
                        href="/app/queue"
                        className="font-mono text-[10px] text-muted hover:text-accent"
                      >
                        View →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right rail: competitors + chat */}
        <aside className="space-y-4">
          <div className="panel p-4">
            <p className="section-label mb-2">Competitors</p>
            <textarea
              className="input-field min-h-[100px] font-mono text-xs"
              placeholder={"julius.ai\nnotebooklm.google.com\nrepomix.com"}
              value={compInput}
              onChange={(e) => setCompInput(e.target.value)}
              disabled={!brand}
            />
            <button
              type="button"
              className="btn-ghost mt-2 w-full !py-1.5 text-xs"
              disabled={!brand}
              onClick={() => void saveCompetitors()}
            >
              Save competitors
            </button>
          </div>

          <div className="panel flex h-[min(520px,70vh)] flex-col p-0">
            <div className="border-b border-line px-4 py-3">
              <p className="section-label text-accent">Talk to AI CMO</p>
              <p className="mt-1 text-[11px] text-muted">
                Daily-style help · grounded in brand memory
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {chat.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    m.role === "cmo"
                      ? "bg-bg-elevated text-ink"
                      : "ml-6 bg-accent/10 text-ink"
                  }`}
                >
                  <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted">
                    {m.role === "cmo" ? "cmo" : "you"}
                  </span>
                  {m.text}
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => void sendChat(e)}
              className="flex gap-2 border-t border-line p-3"
            >
              <input
                className="input-field flex-1 text-sm"
                placeholder="Ask me anything…"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                disabled={chatBusy}
              />
              <button
                type="submit"
                className="btn-primary focus-ring !px-3 text-sm"
                disabled={chatBusy || !msg.trim()}
              >
                Send
              </button>
            </form>
          </div>

          <div className="panel border-accent/30 p-4">
            <p className="font-display text-sm font-semibold">
              Hire your full-time CMO
            </p>
            <p className="mt-1 text-xs text-muted">
              {PUBLIC_PRICING_SUMMARY} — India-first
            </p>
            <Link
              href="/pricing"
              className="btn-primary focus-ring mt-3 inline-flex !px-3 !py-1.5 text-xs"
            >
              See pricing
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
