"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const TOOLKITS = [
  {
    id: "reddit",
    label: "Reddit",
    note: "Easiest founder channel — drafts live in Studio; OAuth connect here; approve → queue until post ID returns",
    priority: true,
  },
  { id: "twitter", label: "X (Twitter)", note: "Publish + engage · poll for mentions" },
  { id: "linkedin", label: "LinkedIn", note: "Company + personal posts · HITL required" },
  { id: "github", label: "GitHub", note: "OAuth via Composio — good first connect test" },
  { id: "gmail", label: "Gmail", note: "Outbound activate emails" },
  { id: "notion", label: "Notion", note: "Brand docs / memo export" },
  {
    id: "google_analytics",
    label: "Google Analytics",
    note: "Read-only traffic (GA4). Needs Composio auth_config + Google Cloud OAuth + Privacy Policy. Sensitive scopes may need Google verification.",
  },
  {
    id: "google_search_console",
    label: "Search Console",
    note: "Search queries & coverage. Same Google Cloud app / verification path as Analytics.",
  },
] as const;

const COMING_SOON = [
  {
    id: "google_business",
    label: "Google Business Profile",
    note: "Local / MSME posts & updates — planned; not wired yet (no fake publish)",
  },
  {
    id: "instagram",
    label: "Instagram",
    note: "Coming soon",
  },
] as const;

type HealthKey = {
  key: string;
  configured: boolean;
  ok: boolean;
  detail: string;
};

type ToolkitConnection = {
  status: string;
  accountId: string;
};

export default function AppConnectorsPage() {
  const [status, setStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthKey[] | null>(null);
  const [catalog, setCatalog] = useState<
    Array<{ key: string; role: string; endpoints: readonly string[] }> | null
  >(null);
  const [connected, setConnected] = useState<
    Record<string, ToolkitConnection>
  >({});
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsNote, setAccountsNote] = useState<string | null>(null);
  const [pendingOauth, setPendingOauth] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshAccounts = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setAccountsLoading(true);
    try {
      const res = await fetch("/api/composio/connect", { method: "GET" });
      const data = (await res.json()) as {
        status?: string;
        byToolkit?: Record<string, ToolkitConnection>;
        message?: string;
        error?: string;
      };
      if (data.status === "ok" && data.byToolkit) {
        setConnected(data.byToolkit);
        setAccountsNote(null);
        // Drop pending OAuth once ACTIVE
        setPendingOauth((prev) => {
          const next = new Set(prev);
          for (const [tk, info] of Object.entries(data.byToolkit ?? {})) {
            if (info.status === "ACTIVE") next.delete(tk);
          }
          return next;
        });
      } else {
        setAccountsNote(data.message || data.error || "Could not load accounts");
      }
    } catch {
      setAccountsNote("Failed to refresh connected accounts");
    } finally {
      if (!opts?.quiet) setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [hRes, cRes] = await Promise.all([
          fetch("/api/health/keys"),
          fetch("/api/agents/catalog"),
        ]);
        const hData = (await hRes.json()) as { keys?: HealthKey[] };
        const cData = (await cRes.json()) as {
          catalog?: Array<{ key: string; role: string; endpoints: string[] }>;
        };
        setHealth(hData.keys ?? []);
        setCatalog(cData.catalog ?? []);
      } catch {
        setHealth([]);
        setCatalog([]);
      }
    })();
    void refreshAccounts();
  }, [refreshAccounts]);

  // After OAuth popup closes, user returns here — refresh on focus/visibility.
  useEffect(() => {
    const onFocus = () => {
      void refreshAccounts({ quiet: true });
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshAccounts({ quiet: true });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshAccounts]);

  // Poll while any toolkit is waiting on OAuth completion.
  useEffect(() => {
    if (pendingOauth.size === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      void refreshAccounts({ quiet: true });
    }, 2500);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [pendingOauth, refreshAccounts]);

  const composioOk = health?.find((k) => k.key === "COMPOSIO_API_KEY")?.ok;
  const e2b = health?.find((k) => k.key === "E2B_API_KEY");
  const openai = health?.find((k) => k.key === "OPENAI_API_KEY");

  async function connect(toolkit: string) {
    setBusy(toolkit);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await res.json()) as {
        status?: string;
        message?: string;
        url?: string;
        error?: string;
        toolkit?: string;
        authConfigId?: string;
      };
      if (data.status === "ok" && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        setPendingOauth((s) => new Set(s).add(toolkit));
        setStatus((s) => ({
          ...s,
          [toolkit]:
            "OAuth window opened — finish auth, close the success tab; this row updates to Connected automatically",
        }));
        // Immediate + delayed polls (OAuth often completes in a few seconds)
        window.setTimeout(() => void refreshAccounts({ quiet: true }), 1500);
        window.setTimeout(() => void refreshAccounts({ quiet: true }), 5000);
        window.setTimeout(() => void refreshAccounts({ quiet: true }), 12000);
      } else if (data.status === "error") {
        setStatus((s) => ({
          ...s,
          [toolkit]: data.message || data.error || "Connect error",
        }));
      } else {
        setStatus((s) => ({
          ...s,
          [toolkit]:
            data.message || data.status || "Connect unavailable",
        }));
      }
    } catch {
      setStatus((s) => ({ ...s, [toolkit]: "failed" }));
    } finally {
      setBusy(null);
    }
  }

  function connectionBadge(toolkitId: string): {
    label: string;
    className: string;
  } {
    const acc = connected[toolkitId];
    if (acc?.status === "ACTIVE") {
      return { label: "Connected", className: "text-ok" };
    }
    if (
      acc?.status === "INITIATED" ||
      acc?.status === "INITIALIZING" ||
      pendingOauth.has(toolkitId)
    ) {
      return { label: "Connecting…", className: "text-warn" };
    }
    if (composioOk) {
      return { label: "Live OAuth ready", className: "text-ok" };
    }
    return { label: "Offline", className: "text-warn" };
  }

  const publishReady = ["reddit", "twitter", "linkedin"].filter(
    (id) => connected[id]?.status === "ACTIVE",
  );

  return (
    <div>
      <div className="panel mb-6 border-accent/30 p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Marketing publish path
        </p>
        <p className="mt-1 text-sm text-muted">
          Connect Reddit / X / LinkedIn here. Studio still only{" "}
          <span className="text-ink">drafts</span>; the HITL queue approves, then
          live-publishes only when the channel shows{" "}
          <span className="text-ok">Connected</span> and the provider returns a
          real post id.
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          Ready to publish:{" "}
          {publishReady.length === 0
            ? "none yet — connect a channel below"
            : publishReady.join(" · ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/app/queue"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
          >
            Open HITL queue
          </Link>
          <Link
            href="/app/studio"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          >
            Studio drafts
          </Link>
        </div>
      </div>

      <div className="panel mb-6 border-line p-3 text-xs text-muted">
        <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Honest wiring
        </p>
        <p className="mt-1">
          Composio OAuth connects when the key is green; publish ACT still waits
          on a connected account + tool execute. E2B code-forensics needs a Team
          key (<span className="font-mono text-ink">e2b_…</span>) — UUID keys
          fail health on purpose. Architecture is wired; live keys unlock the
          lanes.
        </p>
        {e2b && !e2b.ok ? (
          <p className="mt-2 font-mono text-[10px] text-warn">
            E2B: {e2b.detail}
          </p>
        ) : null}
        {openai && !openai.ok ? (
          <p className="mt-1 font-mono text-[10px] text-warn">
            OpenAI: {openai.detail}
          </p>
        ) : null}
        {composioOk === false ? (
          <p className="mt-1 font-mono text-[10px] text-warn">
            Composio key not healthy — account connection is unavailable.
          </p>
        ) : null}
      </div>
      <div className="mt-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-label mb-2">Marketing fleet</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Connect accounts
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Connect Reddit first for founder/MSME drafts — then X and LinkedIn. Live
            Composio OAuth when the API key is green (
            <span className="text-ink">connect.composio.dev</span>
            ). After OAuth success, close that tab — this page refreshes status
            automatically. Approve still{" "}
            <span className="text-ink">queues</span> until a provider returns a post
            ID — we never fake publish.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost focus-ring shrink-0 !px-3 !py-1.5 text-sm"
          onClick={() => void refreshAccounts()}
          disabled={accountsLoading}
        >
          {accountsLoading ? "Refreshing…" : "Refresh status"}
        </button>
      </div>

      {accountsNote ? (
        <p className="mt-3 font-mono text-[10px] text-warn" role="status">
          {accountsNote}
        </p>
      ) : null}

      <div className="panel mt-4 border-accent/30 p-3 text-xs text-muted">
        <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Reddit readiness
        </p>
        <p className="mt-1">
          Studio already drafts Reddit posts. Connect below when Composio is{" "}
          <span className={composioOk ? "text-ok" : "text-warn"}>
            {composioOk ? "PASS" : "not ready"}
          </span>
          . HITL approve → queued (not published) until execute returns an ID.
        </p>
      </div>

      {health ? (
        <div className="panel mt-6 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
            Live key health
          </p>
          <ul className="mt-3 space-y-1 font-mono text-[11px] text-muted">
            {health.map((k) => (
              <li key={k.key}>
                <span className={k.ok ? "text-ok" : k.configured ? "text-danger" : "text-warn"}>
                  {k.ok ? "PASS" : k.configured ? "FAIL" : "SKIP"}
                </span>{" "}
                {k.key} — {k.detail}
              </li>
            ))}
          </ul>
          {openai && !openai.ok ? (
            <p className="mt-3 text-xs text-warn">
              OpenAI: auth may work while chat is quota-blocked — add billing, then
              re-check. Draft generation remains unavailable until chat passes.
            </p>
          ) : null}
          {e2b && !e2b.ok ? (
            <p className="mt-3 text-xs text-warn">
              Sandboxed code runs are not configured yet (coming soon for this
              workspace).
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Checking keys…</p>
      )}

      <ul className="mt-8 space-y-2">
        {TOOLKITS.map((t) => {
          const badge = connectionBadge(t.id);
          const isActive = connected[t.id]?.status === "ACTIVE";
          return (
            <li
              key={t.id}
              className={`panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                isActive ? "border-ok/40" : ""
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display font-semibold">{t.label}</p>
                  {"priority" in t && t.priority ? (
                    <span className="border border-accent/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                      Start here
                    </span>
                  ) : null}
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-sm text-muted">{t.note}</p>
                {isActive && connected[t.id] ? (
                  <p className="mt-1 font-mono text-[10px] text-ok">
                    Account {connected[t.id]!.accountId} · ACTIVE
                  </p>
                ) : null}
                {status[t.id] && !isActive ? (
                  <p className="mt-1 break-all font-mono text-[10px] text-accent">
                    {status[t.id]}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className={
                  isActive
                    ? "btn-ghost focus-ring shrink-0 !px-3 !py-1.5 text-sm"
                    : "btn-primary focus-ring shrink-0 !px-3 !py-1.5 text-sm"
                }
                disabled={busy === t.id}
                onClick={() => void connect(t.id)}
                aria-label={
                  isActive ? `Reconnect ${t.label}` : `Connect ${t.label}`
                }
              >
                {busy === t.id
                  ? "Connecting…"
                  : isActive
                    ? "Reconnect"
                    : composioOk
                      ? "Connect with Composio"
                      : "Try connect"}
              </button>
            </li>
          );
        })}
      </ul>

      {catalog && catalog.length > 0 ? (
        <div className="panel mt-10 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
            Agent lanes · endpoints in use
          </p>
          <p className="mt-2 text-xs text-muted">
            On Screen, the coordinator fans out these roles. Each key only sees
            its lane tools (E2B never gets OpenAI).
          </p>
          <ul className="mt-4 space-y-4">
            {catalog.map((row) => (
              <li key={`${row.key}-${row.role}`}>
                <p className="font-mono text-xs text-ink">
                  {row.key}{" "}
                  <span className="text-muted">→ {row.role}</span>
                </p>
                <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-muted">
                  {row.endpoints.map((ep) => (
                    <li key={ep}>· {ep}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mt-10" aria-label="Coming soon">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Coming soon
        </p>
        <ul className="mt-3 space-y-2">
          {COMING_SOON.map((t) => (
            <li key={t.id} className="panel p-4 opacity-80">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display font-semibold">{t.label}</p>
                <span className="font-mono text-[10px] uppercase text-muted">
                  Not wired
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{t.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-muted">
        Substack / Medium: no Composio toolkit yet. Product Hunt / accelerator /
        hackathon Identify: not configured (zero fabricated rows).
      </p>
    </div>
  );
}
