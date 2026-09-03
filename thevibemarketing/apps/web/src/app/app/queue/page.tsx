"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Post } from "@/lib/marketing-store";
import type { PublishAttempt, PublishOutboxJob } from "@/lib/publishing/publish-attempts";

const PLATFORM_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  hacker_news: "Hacker News",
  website: "Website",
  email: "Email",
};

/** Map draft platform → Composio toolkit slug(s). */
const PLATFORM_TOOLKITS: Record<string, string[]> = {
  x: ["twitter", "x"],
  linkedin: ["linkedin"],
  reddit: ["reddit"],
  hacker_news: ["hackernews"],
};

type ConnMap = Record<string, { status: string; accountId: string }>;

type AttemptRow = {
  attempt: PublishAttempt;
  job: PublishOutboxJob | null;
};

type PublishAttemptResponse = {
  attempts: AttemptRow[];
};

function isPlatformConnected(platform: string, connected: ConnMap): boolean {
  const keys = PLATFORM_TOOLKITS[platform] ?? [platform];
  return keys.some((k) => connected[k]?.status === "ACTIVE");
}

function attemptQueueLabel(
  post: Post,
  attemptRow?: AttemptRow | null,
): string {
  if (post.status === "published") {
    return post.provider_post_id ? `Published · ${post.provider_post_id}` : "Published";
  }
  if (!attemptRow?.attempt) {
    if (post.status === "queued") return "Queued";
    return post.status === "pending" ? "Pending HITL" : post.status;
  }
  const attempt = attemptRow.attempt;
  const job = attemptRow.job;
  const attemptStatus = attempt.status;
  if (job?.status === "leased") {
    return "Executing";
  }
  if (attemptStatus === "outcome_unknown") {
    return "Needs reconciliation";
  }
  if (attemptStatus === "provider_succeeded") {
    return "Provider succeeded; finalizing";
  }
  if (attemptStatus === "retryable_failure") {
    return "Retry scheduled";
  }
  if (attemptStatus === "permanent_failure") {
    return "Failed permanently";
  }
  if (attemptStatus === "cancelled") {
    return "Cancelled";
  }
  if (attemptStatus === "published") {
    return "Published";
  }
  if (attemptStatus === "pending") {
    return "Queued";
  }
  if (attemptStatus === "executing") {
    return "Executing";
  }
  return attemptStatus;
}

function LifecycleRail({
  post,
  attemptRow,
}: {
  post: Post;
  attemptRow?: AttemptRow | null;
}) {
  const attemptStatus = attemptRow?.attempt.status;
  const sending =
    post.status === "queued" &&
    (attemptStatus === "pending" ||
      attemptStatus === "executing" ||
      attemptStatus === "provider_succeeded");
  const stages = [
    { label: "Draft", active: true, complete: post.status !== "pending" },
    {
      label: "Approved",
      active: post.status !== "pending",
      complete: post.status === "published" || sending,
    },
    {
      label: "Sending",
      active: sending,
      complete: post.status === "published",
    },
    {
      label: "Provider confirmed",
      active: post.status === "published",
      complete: post.status === "published",
    },
  ];

  return (
    <ol className="mt-3 grid grid-cols-4 border border-line" aria-label="Publish lifecycle">
      {stages.map((stage, index) => (
        <li
          key={stage.label}
          className={`min-w-0 border-r border-line px-2 py-2 last:border-r-0 ${
            stage.active ? "bg-accent/10 text-ink" : "text-muted"
          }`}
        >
          <span className="block font-mono text-[9px] uppercase tracking-tight sm:text-[10px]">
            {stage.complete ? "✓ " : `${index + 1}. `}
            {stage.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Extract first http(s) URL from agent notes (Reddit/HN thread, etc.). */
function linkFromNote(note?: string | null): string | null {
  if (!note) return null;
  const m = note.match(/https?:\/\/[^\s]+/i);
  return m?.[0]?.replace(/[.,);]+$/, "") ?? null;
}

export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [attemptRows, setAttemptRows] = useState<Record<string, AttemptRow>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"ok" | "warn">("ok");
  const [showQueued, setShowQueued] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [wow, setWow] = useState(false);
  const [creativeBusy, setCreativeBusy] = useState<string | null>(null);
  const [connected, setConnected] = useState<ConnMap>({});
  const [connNote, setConnNote] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/composio/connect");
      const data = (await res.json()) as {
        status?: string;
        byToolkit?: ConnMap;
        message?: string;
        error?: string;
      };
      if (data.status === "ok" && data.byToolkit) {
        setConnected(data.byToolkit);
        setConnNote(null);
      } else {
        setConnected({});
        setConnNote(
          data.message ||
            data.error ||
            "Connectors unavailable — approve still queues without live publish.",
        );
      }
    } catch {
      setConnected({});
      setConnNote("Could not load connector status.");
    }
  }, []);

  const load = useCallback(async (includeQueued: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = includeQueued
        ? "/api/marketing/posts"
        : "/api/marketing/posts?status=pending";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load queue");
      const data = (await res.json()) as { posts: Post[] };
      const filtered = includeQueued
        ? data.posts.filter(
            (p) =>
              p.status === "pending" ||
              p.status === "queued" ||
              p.status === "published",
          )
        : data.posts;
      setPosts(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAttempts = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/publish-attempts?includeCompleted=false");
      if (!res.ok) {
        setAttemptRows({});
        return;
      }
      const data = (await res.json()) as PublishAttemptResponse;
      const mapped = Object.fromEntries(
        (data.attempts ?? []).map((row) => [row.attempt.post_id, row]),
      );
      setAttemptRows(mapped);
    } catch {
      setAttemptRows({});
    }
  }, []);

  useEffect(() => {
    void load(showQueued);
    void loadAttempts();
  }, [load, loadAttempts, showQueued]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    try {
      setWow(new URLSearchParams(window.location.search).get("wow") === "1");
    } catch {
      setWow(false);
    }
  }, []);

  function startEdit(item: Post) {
    setEditingId(item.id);
    setEditBody(item.body);
    setEditTitle(item.title ?? "");
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || null,
          body: editBody,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Save failed");
      }
      const data = (await res.json()) as { post?: Post };
      if (data.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.post! } : p)),
        );
      }
      await loadAttempts();
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelQueued(id: string) {
    setBusyId(id);
    setError(null);
    setStatusNote(null);
    try {
      const res = await fetch(`/api/marketing/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Cancel failed");
      }
      const data = (await res.json()) as { post?: Post };
      if (data.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.post! } : p)),
        );
      }
      await loadAttempts();
      setStatusKind("ok");
      setStatusNote("Queued post moved back to pending.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    setStatusNote(null);
    try {
      if (editingId === id) {
        const saveRes = await fetch(`/api/marketing/drafts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim() || null,
            body: editBody,
          }),
        });
        if (!saveRes.ok) {
          const body = (await saveRes.json()) as { error?: string };
          throw new Error(body.error || "Save failed");
        }
        setEditingId(null);
      }
      const res = await fetch(`/api/marketing/posts/${id}/approve`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        post?: Post;
        publish?: {
          status?: string;
          providerUrl?: string | null;
          providerPostId?: string | null;
          error?: string;
        };
        note?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Approve failed");
      }

      const pubStatus = data.publish?.status ?? "queued";
      if (pubStatus === "published") {
        setStatusKind("ok");
        setStatusNote(
          data.publish?.providerUrl
            ? `Published — provider confirmed. ${data.publish.providerUrl}`
            : data.note ||
                `Published — provider id ${data.publish?.providerPostId ?? "ok"}.`,
        );
        // Keep published item visible so the live link is obvious
        if (!showQueued) setShowQueued(true);
        if (data.post) {
          setPosts((prev) => {
            const others = prev.filter((p) => p.id !== id);
            return [data.post!, ...others];
          });
        }
      } else if (pubStatus === "already_published") {
        setStatusKind("ok");
        setStatusNote(data.note || "Already published with a provider post id.");
        if (data.post) {
          setPosts((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...data.post! } : p)),
          );
        }
      } else {
        // queued / queued_only / error on live path — not published
        setStatusKind("warn");
        setStatusNote(
          data.note ||
            data.publish?.error ||
            "Queued for publish — not marked published without a provider post id.",
        );
        if (showQueued && data.post) {
          setPosts((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...data.post! } : p)),
          );
        } else {
          setPosts((prev) => prev.filter((p) => p.id !== id));
        }
      }
      await loadAttempts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reconcileAttempt(
    postId: string,
    attemptId: string,
    action: "retry_confirm" | "retry_publish" | "cancel" | "mark_provider_succeeded",
  ) {
    setBusyId(postId);
    setError(null);
    setStatusNote(null);
    try {
      const res = await fetch(`/api/marketing/publish-attempts/${attemptId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Action failed");
      }
      await loadAttempts();
      setStatusKind("ok");
      setStatusNote("Attempt action applied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function generateCreative(id: string) {
    setCreativeBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/marketing/creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: id }),
      });
      const data = (await res.json()) as {
        error?: string;
        post?: Post;
        media_url?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.error ||
            "Creative failed — set XAI_API_KEY for Grok Imagine, or skip image.",
        );
      }
      if (data.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.post! } : p)),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creative failed");
    } finally {
      setCreativeBusy(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    setError(null);
    setStatusNote(null);
    try {
      let note = "Rejected from HITL queue";
      if (typeof window !== "undefined") {
        const typed = window.prompt(
          "Why reject? (optional — improves brand memory)",
          "",
        );
        if (typed === null) {
          setBusyId(null);
          return;
        }
        if (typed.trim()) note = typed.trim();
      }
      const res = await fetch(`/api/marketing/posts/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Reject failed");
      }
      setPosts((prev) => prev.filter((p) => p.id !== id));
      await loadAttempts();
      setStatusKind("ok");
      setStatusNote("Rejected — feedback saved to brand memory when available.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label mb-2">Marketing fleet</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            HITL approval queue
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Edit voice, then approve. Approve{" "}
            <span className="text-ink">queues</span> a post — it is not marked
            published until a connected provider (Reddit / X / LinkedIn) returns
            a post ID and URL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--accent)]"
              checked={showQueued}
              onChange={(e) => setShowQueued(e.target.checked)}
            />
            Include queued / published
          </label>
          <Link
            href="/app/studio"
            className="border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-accent hover:underline focus-ring"
          >
            Studio →
          </Link>
          <Link
            href="/app/connectors"
            className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-accent"
          >
            Connect Reddit / X
          </Link>
        </div>
      </div>

      <div className="panel mt-6 flex flex-wrap items-center gap-3 p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Live publish ready
        </p>
        {(["x", "linkedin", "reddit"] as const).map((p) => {
          const on = isPlatformConnected(p, connected);
          return (
            <span
              key={p}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                on
                  ? "border-ok/40 text-ok"
                  : "border-line text-muted"
              }`}
              title={
                on
                  ? `${PLATFORM_LABEL[p]} ACTIVE — approve can live-publish`
                  : `${PLATFORM_LABEL[p]} not connected — approve stays queued`
              }
            >
              {PLATFORM_LABEL[p]} · {on ? "ACTIVE" : "off"}
            </span>
          );
        })}
        <button
          type="button"
          className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
          onClick={() => void loadConnections()}
        >
          Refresh
        </button>
        {connNote ? (
          <p className="w-full text-xs text-warn">{connNote}</p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {statusNote ? (
        <p
          className={`mt-4 text-sm ${statusKind === "ok" ? "text-ok" : "text-warn"}`}
          role="status"
        >
          {statusNote}
        </p>
      ) : null}

      {wow && !loading && posts.length > 0 ? (
        <div className="panel mt-6 border-ok/40 bg-ok/5 p-4" role="status">
          <p className="section-label mb-1 text-ok">Your first drafts</p>
          <p className="text-sm text-ink">
            Edit if needed, then Approve (queues for publish) or Reject. We never
            mark published without a real provider post ID.
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading queue…</p>
      ) : posts.length === 0 ? (
        <div className="panel mt-8 border-accent/30 p-6 sm:p-8">
          <p className="section-label mb-2 text-accent">Nothing waiting yet</p>
          <h2 className="font-display text-lg font-semibold">
            Queue fills after brand + drafts
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted">
            Onboard your product URL (auto-drafts) or generate from Studio.
            Empty queue is normal for a fresh workspace — not a broken product.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/app/onboarding"
              className="btn-primary focus-ring inline-block !px-3 !py-1.5 text-sm"
            >
              Onboard brand
            </Link>
            <Link
              href="/app/studio"
              className="btn-ghost focus-ring inline-block !px-3 !py-1.5 text-sm"
            >
              Open Studio
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-8 space-y-2" aria-label="Approval queue">
          {posts.map((item) => {
            const busy = busyId === item.id;
            const editing = editingId === item.id;
            const sourceLink = linkFromNote(item.note);
            const liveUrl = item.provider_url || null;
            return (
              <li
                key={item.id}
                className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-accent">
                      {PLATFORM_LABEL[item.platform] ?? item.platform}
                    </p>
                    <span
                      className="font-mono text-[10px] uppercase text-muted"
                    >
                      {attemptQueueLabel(item, attemptRows[item.id])} · autonomy{" "}
                      {item.autonomy}
                    </span>
                    <span
                      className={`font-mono text-[10px] uppercase ${
                        isPlatformConnected(item.platform, connected)
                          ? "text-ok"
                          : "text-muted"
                      }`}
                    >
                      {isPlatformConnected(item.platform, connected)
                        ? "connector on"
                        : "connector off"}
                    </span>
                  </div>
                  <LifecycleRail post={item} attemptRow={attemptRows[item.id]} />
                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <input
                        className="input-field text-sm"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title (optional)"
                        aria-label="Edit title"
                      />
                      <textarea
                        className="input-field min-h-[8rem] text-sm"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        aria-label="Edit post body"
                      />
                    </div>
                  ) : (
                    <>
                      {item.title ? (
                        <p className="mt-1 text-sm font-medium">{item.title}</p>
                      ) : null}
                      <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted">
                        {item.body}
                      </p>
                    </>
                  )}
                  {item.rationale ? (
                    <p className="mt-2 font-mono text-[10px] text-muted">
                      Rationale: {item.rationale}
                    </p>
                  ) : null}
                  {item.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.media_url}
                      alt={`Creative for ${item.platform} draft`}
                      className="mt-3 max-h-48 rounded border border-line object-cover"
                    />
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {sourceLink ? (
                      <a
                        href={sourceLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        Source thread →
                      </a>
                    ) : null}
                    {liveUrl ? (
                      <a
                        href={liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-ok hover:underline"
                      >
                        Live post →
                      </a>
                    ) : null}
                    {item.published_at ? (
                      <span className="font-mono text-[10px] text-muted">
                        published {item.published_at.slice(0, 19)}
                      </span>
                    ) : null}
                  </div>
                  {item.note || item.provider_post_id || attemptRows[item.id] ? (
                    <details className="mt-3 border-t border-line pt-2">
                      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted hover:text-ink">
                        Delivery diagnostics
                      </summary>
                      <div className="mt-2 space-y-1 break-all font-mono text-[10px] text-muted">
                        {item.provider_post_id ? (
                          <p>Provider ID: {item.provider_post_id}</p>
                        ) : null}
                        {attemptRows[item.id] ? (
                          <p>Attempt: {attemptRows[item.id].attempt.status}</p>
                        ) : null}
                        {item.note ? <p className="text-warn">{item.note}</p> : null}
                      </div>
                    </details>
                  ) : null}
                </div>
                {item.status === "pending" ? (
                  <div className="flex shrink-0 flex-col gap-2">
                    {editing ? (
                      <button
                        type="button"
                        className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                        onClick={() => void saveEdit(item.id)}
                        disabled={busy}
                      >
                        {busy ? "Saving…" : "Save edit"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                        onClick={() => startEdit(item)}
                        disabled={busy}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
                      onClick={() => void approve(item.id)}
                      disabled={busy}
                      aria-label={`Approve ${item.platform} draft`}
                      title={
                        isPlatformConnected(item.platform, connected)
                          ? "Queue + attempt live publish"
                          : "Queue only until you connect this channel"
                      }
                    >
                      {busy
                        ? "Working…"
                        : isPlatformConnected(item.platform, connected)
                          ? "Approve & send"
                          : "Approve to queue"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                      onClick={() => void generateCreative(item.id)}
                      disabled={busy || creativeBusy === item.id}
                      title="Grok Imagine social graphic (needs XAI_API_KEY)"
                    >
                      {creativeBusy === item.id
                        ? "Imagine…"
                        : item.media_url
                          ? "Regen creative"
                          : "Add creative"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                      onClick={() => void reject(item.id)}
                      disabled={busy}
                      aria-label={`Reject ${item.platform} draft`}
                    >
                      Reject
                    </button>
                  </div>
                ) : item.status === "queued" ? (
                  <div className="flex shrink-0 flex-col gap-2">
                    <span className="font-mono text-[10px] uppercase text-warn">
                      {attemptQueueLabel(item, attemptRows[item.id])}
                    </span>
                    <button
                      type="button"
                      className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
                      onClick={() => void approve(item.id)}
                      disabled={busy}
                      title="Retry Composio live publish — stays queued if no ACTIVE connection"
                    >
                      {busy ? "Retrying…" : "Retry live publish"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                      onClick={() => void cancelQueued(item.id)}
                      disabled={busy}
                    >
                      {busy ? "Cancelling…" : "Cancel queue"}
                    </button>
                    {attemptRows[item.id]?.attempt.status ===
                      "provider_succeeded" ? (
                      <button
                        type="button"
                        className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                        onClick={() =>
                          void reconcileAttempt(
                            item.id,
                            attemptRows[item.id].attempt.id,
                            "retry_confirm",
                          )
                        }
                        disabled={busy}
                      >
                        Retry confirm
                      </button>
                    ) : null}
                    {attemptRows[item.id]?.attempt.status === "outcome_unknown" ? (
                      <p className="max-w-44 text-xs text-warn">
                        Provider outcome unknown. Check the channel before taking
                        another publish action.
                      </p>
                    ) : null}
                    {attemptRows[item.id]?.attempt.status ===
                    "retryable_failure" ? (
                      <button
                        type="button"
                        className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                        onClick={() =>
                          void reconcileAttempt(
                            item.id,
                            attemptRows[item.id].attempt.id,
                            "retry_publish",
                          )
                        }
                        disabled={busy}
                      >
                        Retry publish
                      </button>
                    ) : null}
                    <Link
                      href="/app/connectors"
                      className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-accent"
                    >
                      Connect channel →
                    </Link>
                  </div>
                ) : (
                  <span
                    className={`shrink-0 font-mono text-[10px] uppercase ${
                      item.status === "published" ? "text-ok" : "text-warn"
                    }`}
                  >
                    {attemptQueueLabel(item, attemptRows[item.id])}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
