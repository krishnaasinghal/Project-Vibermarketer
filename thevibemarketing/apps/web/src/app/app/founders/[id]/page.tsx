"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Founder, Product, Screening, Signal } from "@vibe/engine";
import { AxisPanel } from "@/components/AxisPanel";
import { ScoreBar } from "@/components/ScoreBar";
import { ScreeningTheater } from "@/components/ScreeningTheater";
import { TraceDrawer } from "@/components/TraceDrawer";
import { TrustBadge } from "@/components/TrustBadge";
import { emptyGravity } from "@/lib/normalize";
import { readJsonSafe } from "@/lib/safe-json";

type TraitBand = {
  trait: string;
  proxy: string;
  mid: number;
  low: number;
  high: number;
  confidence: number;
  note: string;
};

type Detail = {
  founder: Founder;
  product?: Product | null;
  signals: Signal[];
  screening?: Screening | null;
  memo?: { id: string; decision: string } | null;
  funnel_clock?: string;
  within_24h?: boolean;
  conviction?: {
    crossed: boolean;
    score: number;
    reasons: string[];
  };
  trait_bands?: TraitBand[];
  thesis_fit?: string;
  cold_start?: boolean;
  canonical_id?: string;
};

export default function FounderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [theaterDone, setTheaterDone] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [activateNote, setActivateNote] = useState<string | null>(null);
  const [mailto, setMailto] = useState<string | null>(null);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState<string | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchNote, setResearchNote] = useState<string | null>(null);
  const [researchSummary, setResearchSummary] = useState<{
    findings: number;
    questions: number;
    partial: boolean;
    synthesis: string;
    providers: string;
  } | null>(null);
  const [traceOpenSignal, setTraceOpenSignal] = useState(0);
  const [traceFocus, setTraceFocus] = useState<string | null>(null);
  const [justConverged, setJustConverged] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [gatherStep, setGatherStep] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    bio: "",
    company: "",
    oneliner: "",
    sector: "",
    website: "",
    github: "",
    twitter: "",
    linkedin: "",
    hn: "",
  });
  const autoScreened = useRef(false);

  function inspectTrust() {
    setTraceFocus("trust_claims");
    setTraceOpenSignal((n) => n + 1);
    document.getElementById("agent-trace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/founders/${encodeURIComponent(id)}`);
    const { data: body } = await readJsonSafe<Detail & { error?: string }>(res);
    if (!res.ok || !body?.founder) {
      setError(body?.error || "Founder not found");
      setData(null);
      return;
    }
    setData(body);
    const f = body.founder;
    const p = body.product;
    setForm({
      name: f.name ?? "",
      bio: f.bio ?? "",
      company: p?.name ?? "",
      oneliner: p?.oneliner ?? "",
      sector: p?.sector ?? "",
      website:
        f.links?.[0] ??
        (p?.domain
          ? p.domain.startsWith("http")
            ? p.domain
            : `https://${p.domain}`
          : ""),
      github: f.handles?.github ?? "",
      twitter: f.handles?.twitter ?? f.handles?.x ?? "",
      linkedin: f.handles?.linkedin ?? "",
      hn: f.handles?.hn ?? "",
    });
    // Canonicalize short slugs (/openclaw → /live_github_openclaw) so traces/memo links work.
    if (body.canonical_id && body.canonical_id !== id) {
      router.replace(
        `/app/founders/${encodeURIComponent(body.canonical_id)}`,
      );
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/traces/latest/${id}`);
      if (!res.ok) return;
      const body = (await res.json()) as { run_id?: string | null };
      if (body.run_id) setRunId(body.run_id);
    })();
  }, [id]);

  const runScreen = useCallback(async () => {
    setScreenBusy(true);
    setTheaterDone(false);
    setError(null);
    let memoReady = false;
    try {
      const res = await fetch(`/api/screen/${id}`, { method: "POST" });
      const body = (await res.json()) as { error?: string; run_id?: string };
      if (!res.ok) throw new Error(body.error || "Screen failed");
      setRunId(body.run_id ?? null);
      setTheaterDone(true);
      await load();
      const refreshed = await fetch(`/api/founders/${encodeURIComponent(id)}`);
      const { data: fresh } = await readJsonSafe<{ memo?: { id: string } }>(refreshed);
      memoReady = Boolean(fresh?.memo?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screen failed");
    } finally {
      setScreenBusy(false);
    }
    return memoReady;
  }, [id, load]);

  const runDeepDiligence = useCallback(async () => {
    setResearchBusy(true);
    setResearchNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/agents/research/${id}`, { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        run_id?: string;
        next?: string;
        dossier?: {
          findings?: unknown[];
          open_questions?: string[];
          partial?: boolean;
          synthesis?: string;
          provider_status?: Record<string, string>;
        };
      };
      if (!res.ok) throw new Error(body.error || "Deep research failed");
      if (body.run_id) setRunId(body.run_id);
      const findings = body.dossier?.findings?.length ?? 0;
      const questions = body.dossier?.open_questions?.length ?? 0;
      setResearchSummary({
        findings,
        questions,
        partial: Boolean(body.dossier?.partial),
        synthesis: body.dossier?.synthesis ?? "skipped",
        providers: Object.entries(body.dossier?.provider_status ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(" · "),
      });
      setResearchNote(
        body.next ??
          `Deep diligence complete — ${findings} findings, ${questions} open questions. Run 3-axis screen for $100K.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deep research failed");
    } finally {
      setResearchBusy(false);
    }
  }, [id, load]);

  const attachProbeClaim = useCallback(async () => {
    setClaimNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/founders/${id}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: true }),
      });
      const body = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) throw new Error(body.error || "Claim failed");
      setClaimNote(body.note ?? "Probe claim attached");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    }
  }, [id, load]);

  const runEnrich = useCallback(async () => {
    setEnrichBusy(true);
    setEnrichNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/agents/enrich/${id}`, { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        ok_count?: number;
        providers_used?: string[];
        lanes?: Array<{
          role: string;
          ok: boolean;
          sandbox_id?: string;
          evidence?: string[];
          error?: string;
        }>;
      };
      if (!res.ok) throw new Error(body.error || "Enrich failed");
      const sandboxes = (body.lanes ?? [])
        .filter((l) => l.sandbox_id)
        .map((l) => `${l.role}:${l.sandbox_id}`);
      const fails = (body.lanes ?? [])
        .filter((l) => !l.ok)
        .map((l) => `${l.role}${l.error ? ` (${l.error})` : ""}`);
      setEnrichNote(
        [
          `Lanes OK ${body.ok_count ?? 0}/${body.lanes?.length ?? 0}`,
          body.providers_used?.length
            ? `providers: ${body.providers_used.join(", ")}`
            : null,
          sandboxes.length ? `E2B: ${sandboxes.join("; ")}` : "E2B: no sandbox (key or repo missing)",
          fails.length ? `failed: ${fails.join("; ")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrich failed");
    } finally {
      setEnrichBusy(false);
    }
  }, [id, load]);

  useEffect(() => {
    if (typeof window === "undefined" || autoScreened.current) return;
    if (new URLSearchParams(window.location.search).get("screen") === "1") {
      autoScreened.current = true;
      void (async () => {
        const memoReady = await runScreen();
        const openMemo = new URLSearchParams(window.location.search).get("open_memo") === "1";
        if (memoReady && openMemo) {
          router.replace(`/app/founders/${encodeURIComponent(id)}/memo`);
        }
      })();
    }
  }, [runScreen, router, id]);

  // Inbound / thin profiles: open the profile editor so judges add socials first.
  useEffect(() => {
    if (!data) return;
    const thin =
      (data.founder.founder_score ?? 0) < 25 ||
      !(data.founder.handles?.github || data.founder.links?.length);
    if (thin) setProfileOpen(true);
  }, [data?.founder.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = useCallback(async (): Promise<boolean> => {
    setProfileBusy(true);
    setProfileNote(null);
    setError(null);
    try {
      const links = form.website.trim() ? [form.website.trim()] : undefined;
      const res = await fetch(`/api/founders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          bio: form.bio,
          company: form.company,
          oneliner: form.oneliner,
          sector: form.sector,
          website: form.website,
          links,
          handles: {
            github: form.github,
            twitter: form.twitter,
            x: form.twitter,
            linkedin: form.linkedin,
            hn: form.hn,
          },
        }),
      });
      const body = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) throw new Error(body.error || "Profile save failed");
      setProfileNote(body.note ?? "Profile saved");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profile save failed");
      return false;
    } finally {
      setProfileBusy(false);
    }
  }, [form, id, load]);

  /**
   * Linear path: save profile → full pipeline (deep research is inside screen —
   * do not call /agents/research first or we double-pay latency/keys).
   */
  const gatherAndScreen = useCallback(async () => {
    setError(null);
    setProfileNote(null);
    setGatherStep("1/2 · Saving profile to Memory…");
    const ok = await saveProfile();
    if (!ok) {
      setGatherStep(null);
      return;
    }
    setGatherStep(
      "2/2 · Pipeline: signals → agents → deep research → Trust → axes → memo…",
    );
    await runScreen();
    setGatherStep(null);
    setProfileNote(
      "Gather complete — open $100K memo. Deep research ran inside the screen (one pass). Axes never averaged; gaps listed first.",
    );
  }, [runScreen, saveProfile]);
  async function activate(action: "draft" | "sent" | "applied") {
    setActionBusy(true);
    setActivateNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/activate/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, channel: "email" }),
      });
      const body = (await res.json()) as {
        error?: string;
        note?: string;
        mailto?: string;
      };
      if (!res.ok) throw new Error(body.error || "Activate failed");
      setActivateNote(body.note ?? "OK");
      if (body.mailto) setMailto(body.mailto);
      if (action === "applied") setJustConverged(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setActionBusy(false);
    }
  }

  const anyBusy =
    screenBusy || actionBusy || enrichBusy || researchBusy || profileBusy;

  if (error && !data) {
    return (
      <div>
        <p className="text-danger" role="alert">
          {error}
        </p>
        <p className="mt-2 max-w-md text-sm text-muted">
          Profile id{" "}
          <span className="font-mono text-xs text-ink">{id}</span>. If you just
          saved, try reload — serverless instances read from Postgres.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void load()}
          >
            Retry load
          </button>
          <Link
            href="/app/radar"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          >
            ← Back to radar
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Loading founder…</p>;
  }

  const { founder, product, signals, screening } = data;
  const g = founder.gravity?.components ? founder.gravity : emptyGravity();
  const history = founder.score_history ?? [];
  const activation = founder.activation;
  /** Brief: Identify (radar) → Activate (outreach) → Converge (same Screening). */
  const funnelSteps = [
    { key: "identify", label: "Identify", status: "identified" as const },
    { key: "draft", label: "Activate · draft", status: "drafted" as const },
    { key: "sent", label: "Activate · sent", status: "sent" as const },
    { key: "applied", label: "Converge", status: "applied" as const },
  ];
  const currentStatus = activation?.status ?? "none";
  const currentIdx =
    currentStatus === "none"
      ? 0 // Identified by being on radar / this page
      : Math.max(
          0,
          funnelSteps.findIndex((s) => s.status === currentStatus),
        );
  const converged = currentStatus === "applied";

  return (
    <div>
      <Link href="/app/radar" className="text-sm text-muted hover:text-accent">
        ← Radar
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {founder.name}
            </h1>
            {data.funnel_clock ? (
              <span
                className={`font-mono text-[10px] uppercase tracking-wider ${
                  data.within_24h ? "text-ok" : "text-warn"
                }`}
                title="24h decision-support SLA — time since first Memory write"
              >
                {data.funnel_clock}
              </span>
            ) : null}
            {data.conviction?.crossed ? (
              <span className="border border-accent/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                Conviction
              </span>
            ) : null}
            {data.thesis_fit ? (
              <span className="font-mono text-[10px] uppercase text-muted">
                thesis {data.thesis_fit}
              </span>
            ) : null}
            {data.memo?.decision ? (
              <span
                className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  data.memo.decision === "yes"
                    ? "border-ok/50 text-ok"
                    : data.memo.decision === "no"
                      ? "border-danger/50 text-danger"
                      : "border-warn/50 text-warn"
                }`}
                title="Decision-support lean — not an automated wire"
              >
                $100K {data.memo.decision}
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {product?.name ? `${product.name} — ` : ""}
            {product?.oneliner ?? founder.bio ?? "No bio"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void gatherAndScreen()}
            disabled={anyBusy}
            title="Save profile → deep research (Tavily/Firecrawl/E2B) → 3-axis screen + memo"
          >
            {gatherStep ? gatherStep : "Gather & screen"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => setProfileOpen((v) => !v)}
            disabled={profileBusy}
          >
            {profileOpen ? "Hide profile" : "Edit profile"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void runScreen()}
            disabled={anyBusy}
          >
            {screenBusy ? "Screening…" : "Run 3-axis screen"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void runDeepDiligence()}
            disabled={anyBusy}
            title="Orchestrated deep diligence: Tavily + Firecrawl + optional E2B → cite-bound synthesis"
          >
            {researchBusy ? "Researching…" : "Deep diligence"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void runEnrich()}
            disabled={anyBusy}
            title="Fan out code/web/claim/HN/memory lanes using live API endpoints"
          >
            {enrichBusy ? "Enriching…" : "Run agent enrich"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void attachProbeClaim()}
            disabled={anyBusy}
            title="Labeled overstated claim + public evidence URL → Trust contradiction + url_diligence"
          >
            Diligence probe claim
          </button>
          <Link
            href={`/app/founders/${encodeURIComponent(id)}/memo`}
            prefetch
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
          >
            {data.memo?.decision
              ? `Open $100K ${data.memo.decision} memo`
              : "Open memo"}
          </Link>
        </div>
      </div>

      {profileOpen ? (
        <section className="panel mt-6 border-accent/30 p-5" aria-label="Founder profile">
          <h2 className="font-display text-lg font-semibold">Founder profile</h2>
          <p className="mt-1 text-xs text-muted">
            Public socials drive score. Without GitHub / site / X, inbound
            applications stay ~low gravity (thin signal). Agents use these as
            seeds for Tavily · Firecrawl · GitHub · E2B — nothing is invented.
          </p>
          <p className="mt-2 border border-accent/30 bg-accent/5 px-3 py-2 font-mono text-[11px] text-accent">
            Recommended for real scores: GitHub handle + product website. Then
            Gather &amp; screen.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["name", "Founder name", "text"],
                ["company", "Company", "text"],
                ["oneliner", "One-liner", "text"],
                ["sector", "Sector", "text"],
                ["website", "Website / deck URL *", "url"],
                ["github", "GitHub handle * (e.g. Anand-0037)", "text"],
                ["twitter", "X / Twitter handle", "text"],
                ["linkedin", "LinkedIn slug or URL", "text"],
                ["hn", "HN username", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-muted">{label}</span>
                <input
                  type={type}
                  className="input-field focus-ring w-full"
                  placeholder={
                    key === "github"
                      ? "username or user/repo"
                      : key === "website"
                        ? "https://yoursite.com"
                        : undefined
                  }
                  value={form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">Bio</span>
              <textarea
                className="input-field focus-ring min-h-[72px] w-full"
                value={form.bio}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bio: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
              disabled={anyBusy}
              onClick={() => void saveProfile()}
            >
              {profileBusy ? "Saving…" : "Save to Memory"}
            </button>
            <button
              type="button"
              className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
              disabled={anyBusy}
              onClick={() => void gatherAndScreen()}
            >
              {gatherStep ?? "Save → Gather & screen"}
            </button>
          </div>
          {profileNote ? (
            <p className="mt-3 font-mono text-xs text-accent" role="status">
              {profileNote}
            </p>
          ) : null}
          {gatherStep ? (
            <p className="mt-2 font-mono text-xs text-muted" role="status">
              {gatherStep}
            </p>
          ) : null}
        </section>
      ) : null}

      <ScreeningTheater
        active={screenBusy || Boolean(gatherStep?.includes("2/"))}
        complete={theaterDone && !screenBusy}
        founderId={id}
      />
      {claimNote ? (
        <p className="mt-3 font-mono text-xs text-accent" role="status">
          {claimNote}
        </p>
      ) : null}
      {!profileOpen && profileNote ? (
        <p className="mt-3 font-mono text-xs text-accent" role="status">
          {profileNote}
        </p>
      ) : null}

      {theaterDone && !screenBusy ? (
        <div className="panel mt-4 flex flex-wrap items-center justify-between gap-3 border-accent/40 p-4">
          <div>
            <p className="text-sm text-ink">
              Screen complete
              {data.memo?.decision ? (
                <>
                  {" · "}
                  <span className="font-mono uppercase text-accent">
                    $100K {data.memo.decision}
                  </span>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted">
              Decision-support for a human investor — not an automated wire.
            </p>
          </div>
          <Link
            href={`/app/founders/${encodeURIComponent(id)}/memo`}
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
          >
            {data.memo?.decision
              ? `Open $100K ${data.memo.decision} memo →`
              : "Open $100K memo →"}
          </Link>
        </div>
      ) : null}

      {researchNote || researchSummary ? (
        <div className="panel mt-4 border-accent/30 p-4" role="status">
          <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
            Deep diligence dossier
          </p>
          {researchSummary ? (
            <p className="mt-2 text-sm text-ink">
              {researchSummary.findings} findings · {researchSummary.questions}{" "}
              open questions · synthesis {researchSummary.synthesis}
              {researchSummary.partial ? " · PARTIAL" : ""}
            </p>
          ) : null}
          {researchSummary?.providers ? (
            <p className="mt-1 font-mono text-[10px] text-muted">
              {researchSummary.providers}
            </p>
          ) : null}
          {researchNote ? (
            <p className="mt-2 text-xs text-muted">{researchNote}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            Full screen also runs this orchestration automatically before the
            $100K decision. Cite-bound only — no invented TAM or traction.
          </p>
        </div>
      ) : null}

      {enrichNote ? (
        <p className="mt-3 font-mono text-xs text-muted" role="status">
          {enrichNote}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="panel mt-8 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            Outbound · Activate → Converge
          </h2>
          {converged ? (
            <span className="border border-ok/50 bg-ok/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ok">
              Converged · same funnel as inbound
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase text-accent">
              {activation?.status ?? "identified"}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted">
          Cold outreach, not cold investment — Activate triggers a real
          application; Converge merges into the same Screening step as inbound
          apply.
        </p>
        <div
          className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3"
          aria-label="Outbound Identify Activate Converge funnel"
        >
          {funnelSteps.map((step, idx) => {
            const active = idx <= currentIdx;
            const current =
              step.status === "identified"
                ? currentStatus === "none" || !activation
                : currentStatus === step.status;
            return (
              <div key={step.key} className="flex items-center gap-2 sm:gap-3">
                {idx > 0 ? (
                  <span
                    className={`font-mono text-xs ${
                      active ? "text-accent" : "text-muted/40"
                    }`}
                    aria-hidden
                  >
                    →
                  </span>
                ) : null}
                <span
                  className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                    current
                      ? "border-accent bg-accent/10 text-accent"
                      : active
                        ? "border-accent/40 text-accent/80"
                        : "border-line text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            disabled={anyBusy}
            onClick={() => void activate("draft")}
          >
            {actionBusy ? "Working…" : "Draft outreach"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            disabled={anyBusy}
            onClick={() => void activate("sent")}
          >
            {actionBusy ? "Working…" : "Mark sent"}
          </button>
          <button
            type="button"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            disabled={anyBusy}
            onClick={() => void activate("applied")}
          >
            {actionBusy ? "Working…" : "Mark applied → converge"}
          </button>
          {mailto ? (
            <a href={mailto} className="btn-ghost focus-ring !px-3 !py-1.5 text-sm">
              Open mailto
            </a>
          ) : null}
        </div>
        {activateNote ? (
          <p className="mt-3 font-mono text-xs text-accent">{activateNote}</p>
        ) : null}
        {justConverged || converged ? (
          <div className="panel mt-4 flex flex-wrap items-center justify-between gap-3 border-ok/40 bg-ok/5 p-3">
            <p className="text-sm text-muted">
              Converged into the same Screening funnel as inbound. Run the
              3-axis screen next.
            </p>
            <button
              type="button"
              className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
              disabled={anyBusy}
              onClick={() => void runScreen()}
            >
              {screenBusy ? "Screening…" : "Run 3-axis screen →"}
            </button>
          </div>
        ) : null}
        {activation?.body ? (
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap border border-line p-3 font-mono text-xs text-muted">
            {activation.subject ? `Subject: ${activation.subject}\n\n` : ""}
            {activation.body}
          </pre>
        ) : null}
      </section>

      <section className="panel mt-8 p-5">
        <h2 className="font-display text-lg font-semibold">
          Founder Score · Memory
        </h2>
        <p className="mt-1 text-xs text-muted">
          Persistent across applications — never resets. Trend from score history,
          not a substitute for the 3-axis opportunity score.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ScoreBar value={g.gravity_score} label="Gravity" tone="accent" />
          <ScoreBar value={founder.founder_score} label="Founder Score" tone="cool" />
        </div>
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase text-muted">
            Score history ({history.length} pts)
          </p>
          {history.length >= 2 ? (
            <div className="mt-2 flex h-12 items-end gap-1">
              {history.map((h, idx) => (
                <div
                  key={`${h.at}-${idx}`}
                  className="flex-1 bg-accent/70"
                  style={{ height: `${Math.max(8, h.score)}%` }}
                  title={`${h.score.toFixed(0)} @ ${h.at.slice(0, 10)}`}
                />
              ))}
            </div>
          ) : history.length === 1 ? (
            <p className="mt-2 text-xs text-muted">
              One point recorded — trend needs 2+ history points (re-score after
              a later ingest).
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              No score history yet — the current Founder Score still holds; trend
              appears after re-score.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <TrustBadge confidence={founder.score_confidence} />
          {data.cold_start ? (
            <span className="border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase text-accent">
              cold-start mode · track record weight redistributed
            </span>
          ) : null}
          {g.abstain ? (
            <span className="border border-warn/40 px-2 py-0.5 font-mono text-[10px] uppercase text-warn">
              abstain · {g.abstain_reason ?? "thin signal"}
            </span>
          ) : null}
        </div>
        <ul className="mt-4 space-y-1 break-words text-sm text-muted">
          {g.evidence.map((e) => (
            <li key={e}>· {e}</li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["velocity", g.components.velocity],
              ["pull", g.components.pull_ratio],
              ["cadence", g.components.cadence],
              ["engagement", g.components.engagement],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="border border-line p-2">
              <p className="font-mono text-[10px] uppercase text-muted">{k}</p>
              <p className="font-mono text-lg tabular-nums">
                {Number.isFinite(v) ? v.toFixed(0) : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {data.trait_bands && data.trait_bands.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">
            Soft-skill intervals · research prototype
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Brief Area of Research #1 — prediction intervals around soft proxies
            from public footprints. Not validated predictors; bands widen when
            sources are sparse (data quality vs volume).
          </p>
          <ul className="mt-4 space-y-3">
            {data.trait_bands.map((t) => (
              <li key={t.trait} className="panel p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{t.trait}</p>
                  <p className="font-mono text-xs tabular-nums text-muted">
                    {t.low.toFixed(0)}–{t.high.toFixed(0)} · mid{" "}
                    {t.mid.toFixed(0)} · conf {(t.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="relative mt-2 h-2 overflow-hidden border border-line bg-bg">
                  <div
                    className="absolute inset-y-0 bg-cool/30"
                    style={{
                      left: `${t.low}%`,
                      width: `${Math.max(2, t.high - t.low)}%`,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-accent"
                    style={{ left: `${t.mid}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] uppercase text-muted">
                  via {t.proxy}
                </p>
                <p className="mt-1 text-xs text-muted">{t.note}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">
          Three axes — not averaged
        </h2>
        {screening ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <AxisPanel
              title="Founder"
              axis={screening.founder_axis}
              description="Who they are + Founder Score as one input"
            />
            <AxisPanel
              title="Market"
              axis={screening.market_axis}
              description="Bullish / neutral / bear — independent"
            />
            <AxisPanel
              title="Idea vs Market"
              axis={screening.idea_axis}
              description="Survives as-is or team must pivot"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No screening yet. Run the 3-axis screen (first-pass gate runs first).
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Signals</h2>
        <ul className="mt-3 space-y-2">
          {signals.map((s) => (
            <li key={s.id} className="panel min-w-0 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-xs text-accent">{s.source}</span>
                <span className="font-mono text-[10px] text-muted">
                  {s.observed_at?.slice(0, 10)}
                </span>
              </div>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.url}
                  className="mt-1 block min-w-0 break-all text-xs text-muted hover:text-accent"
                >
                  {s.url}
                </a>
              ) : (
                <span className="mt-1 block text-xs text-muted">no url</span>
              )}
            </li>
          ))}
          {signals.length === 0 ? (
            <li className="text-sm text-muted">
              No signals ingested.{" "}
              <Link
                href="/app/radar"
                className="focus-ring text-accent hover:underline"
              >
                Refresh radar →
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">
          Claims · per-claim Trust Score
        </h2>
        {(founder.claims ?? []).length === 0 &&
        (product?.traction_claims ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No claims yet. Use{" "}
            <span className="text-ink">Diligence probe claim</span> to attach a
            labeled overstated traction claim, then run the 3-axis screen — Trust
            will flag the contradiction.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...(founder.claims ?? []), ...(product?.traction_claims ?? [])].map(
              (c, i) => (
                <li
                  key={`${c.text}-${i}`}
                  className={`panel flex flex-wrap items-start justify-between gap-2 p-3 ${
                    c.contradiction ? "claim-flash border-danger/50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm">{c.text}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-muted">
                      {c.category}
                      {!c.evidence_url ? " · no evidence url" : null}
                    </p>
                    {c.evidence_url ? (
                      <a
                        href={c.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-xs text-accent hover:underline"
                      >
                        {c.evidence_url}
                      </a>
                    ) : null}
                    {c.contradiction_note ? (
                      <p className="mt-1 text-xs text-danger">
                        {c.contradiction_note}
                      </p>
                    ) : null}
                  </div>
                  <TrustBadge
                    confidence={c.confidence ?? 0}
                    contradiction={c.contradiction}
                    onInspect={runId ? inspectTrust : undefined}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <div className="mt-8" id="agent-trace">
        <TraceDrawer
          runId={runId}
          autoOpen={theaterDone}
          openSignal={traceOpenSignal}
          focusStep={traceFocus}
        />
      </div>
    </div>
  );
}
