"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatPlanError,
  readPlanApiError,
} from "@/lib/api-plan-error";
import type {
  AutonomyLevel,
  BrandContext,
  CampaignBrief,
  LoopRun,
  Post,
} from "@/lib/marketing-store";

const PLATFORM_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  reddit: "Reddit",
};

const AUTONOMY_LEVELS: AutonomyLevel[] = ["L1", "L2", "L3"];

const AUTONOMY_HINT: Record<AutonomyLevel, string> = {
  L1: "Every draft pending HITL → Approve queues (live needs connected account)",
  L2: "X/LinkedIn drafts auto-queue after generate (not published). Reddit/SEO/HN stay pending",
  L3: "Coming soon — auto-publish blocked until a dedicated live path exists",
};

export default function StudioPage() {
  const [brand, setBrand] = useState<BrandContext | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loops, setLoops] = useState<LoopRun[]>([]);
  const [autonomy, setAutonomy] = useState<AutonomyLevel>("L1");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loopBusy, setLoopBusy] = useState<string | null>(null);
  const [savingAutonomy, setSavingAutonomy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignBrief | null>(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [redditBusy, setRedditBusy] = useState(false);
  const [seoBusy, setSeoBusy] = useState(false);
  const [hnBusy, setHnBusy] = useState(false);
  const [dayDraftBusy, setDayDraftBusy] = useState<number | null>(null);
  const [meterLine, setMeterLine] = useState<string | null>(null);
  const [features, setFeatures] = useState<
    Record<string, { allowed: boolean; min_label: string; label: string }>
  >({});
  const [upgradeHref, setUpgradeHref] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState<"drafts" | "campaign">(
    "drafts",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [brandRes, postsRes, autonomyRes, loopsRes, campRes] =
        await Promise.all([
          fetch("/api/marketing/brand"),
          fetch("/api/marketing/posts"),
          fetch("/api/marketing/autonomy"),
          fetch("/api/marketing/loops"),
          fetch("/api/marketing/campaign"),
        ]);
      if (!brandRes.ok || !postsRes.ok) throw new Error("Failed to load studio");
      const brandData = (await brandRes.json()) as { brand: BrandContext | null };
      const postsData = (await postsRes.json()) as { posts: Post[] };
      setBrand(brandData.brand);
      setPosts(postsData.posts.slice(0, 12));
      if (autonomyRes.ok) {
        const a = (await autonomyRes.json()) as { autonomy: AutonomyLevel };
        setAutonomy(a.autonomy);
      }
      if (loopsRes.ok) {
        const l = (await loopsRes.json()) as { loops: LoopRun[] };
        setLoops(l.loops.slice(0, 6));
      }
      if (campRes.ok) {
        const c = (await campRes.json()) as { campaign: CampaignBrief | null };
        setCampaign(c.campaign);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/me");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          meter?: {
            used?: number;
            limit?: number;
            remaining?: number;
            period?: string;
            label?: string;
          };
          features?: Record<
            string,
            { allowed: boolean; min_label: string; label: string }
          >;
        };
        if (cancelled) return;
        if (data.meter) {
          setMeterLine(
            `${data.meter.label ?? "Free"} · ${data.meter.used ?? 0}/${data.meter.limit ?? "—"} runs (${data.meter.period ?? "mo"})`,
          );
        }
        if (data.features) setFeatures(data.features);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function featureAllowed(key: string): boolean {
    // Until billing/me loads, allow clicks — API still enforces
    if (!features[key]) return true;
    return features[key].allowed;
  }

  function featureTitle(key: string, fallback: string): string {
    const f = features[key];
    if (f && !f.allowed) {
      return `${f.label} requires ${f.min_label}+ — upgrade on /pricing`;
    }
    return fallback;
  }

  async function handlePlanFail(res: Response): Promise<never> {
    const pe = await readPlanApiError(res);
    if (pe.meter) {
      setMeterLine(
        `Runs ${pe.meter.used}/${pe.meter.limit} left ${pe.meter.remaining ?? 0} (${pe.meter.period ?? ""})`,
      );
    }
    if (pe.upgrade) setUpgradeHref(pe.upgrade);
    throw new Error(formatPlanError(pe));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setBanner(null);
    setUpgradeHref(null);
    try {
      const res = await fetch("/api/marketing/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) await handlePlanFail(res);
      const data = (await res.json()) as {
        source?: string;
        auto_queued?: number;
        autonomy?: string;
        openai?: { ok: boolean; detail?: string };
        meter?: {
          used?: number;
          limit?: number;
          remaining?: number;
          period?: string;
        };
      };
      const source = data.source ?? "openai+supermemory";
      const aq = data.auto_queued ?? 0;
      if (data.meter) {
        setMeterLine(
          `Runs ${data.meter.used}/${data.meter.limit} left ${data.meter.remaining} (${data.meter.period})`,
        );
      }
      setBanner(
        aq > 0
          ? `Generated drafts (${source}). L2 auto-queued ${aq} low-risk channel(s) — still not published without provider id. Reddit stays pending HITL.`
          : `Generated 3 on-brand drafts (${source}) → review in HITL queue. Nothing published.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft generation failed");
    } finally {
      setGenerating(false);
    }
  }

  /** Map campaign day channel → draft platform (email/blog → linkedin long-form). */
  function platformForCampaignDay(
    channel: string,
  ): "x" | "linkedin" | "reddit" | null {
    const c = channel.toLowerCase();
    if (c === "x" || c === "linkedin" || c === "reddit") return c;
    if (c === "email" || c === "blog") return "linkedin";
    return null;
  }

  async function draftCampaignDay(day: {
    day: number;
    channel: string;
    goal: string;
    draft_hint: string;
  }) {
    const platform = platformForCampaignDay(day.channel);
    if (!platform) {
      setError(`Cannot draft for channel “${day.channel}” yet.`);
      return;
    }
    setDayDraftBusy(day.day);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/marketing/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          day: day.day,
          goal: day.goal,
          draft_hint: day.draft_hint,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        auto_queued?: number;
        posts?: unknown[];
      };
      if (!res.ok) {
        throw new Error(data.error || "Day draft failed");
      }
      const n = Array.isArray(data.posts) ? data.posts.length : 1;
      setBanner(
        `Day ${day.day} · ${platform}: ${n} draft(s) in HITL${
          data.auto_queued ? ` (${data.auto_queued} auto-queued L2)` : ""
        }. Nothing published without provider id.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Day draft failed");
    } finally {
      setDayDraftBusy(null);
    }
  }

  async function generateCampaign() {
    setCampaignBusy(true);
    setError(null);
    setBanner(null);
    setUpgradeHref(null);
    try {
      const res = await fetch("/api/marketing/campaign", { method: "POST" });
      if (!res.ok) await handlePlanFail(res);
      const data = (await res.json()) as { campaign: CampaignBrief };
      setCampaign(data.campaign);
      setBanner(
        "7-day campaign brief saved. Generate channel drafts next — still HITL before anything queues.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaign brief failed");
    } finally {
      setCampaignBusy(false);
    }
  }

  async function runRedditAgent() {
    setRedditBusy(true);
    setError(null);
    setBanner(null);
    setUpgradeHref(null);
    try {
      const res = await fetch("/api/marketing/agents/reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 4, enqueue: true }),
      });
      if (!res.ok) await handlePlanFail(res);
      const data = (await res.json()) as {
        error?: string;
        enqueued?: number;
        note?: string;
      };
      const n = data.enqueued ?? 0;
      setBanner(
        `Reddit agent: ${n} reply draft${n === 1 ? "" : "s"} in HITL queue (never auto-posted). ${data.note || ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reddit agent failed");
    } finally {
      setRedditBusy(false);
    }
  }

  async function runSeoAgent() {
    setSeoBusy(true);
    setError(null);
    setBanner(null);
    setUpgradeHref(null);
    try {
      const res = await fetch("/api/marketing/agents/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enqueue: true }),
      });
      if (!res.ok) await handlePlanFail(res);
      const data = (await res.json()) as {
        error?: string;
        note?: string;
        draft?: { title?: string; primary_keyword?: string };
        keywords?: unknown[];
      };
      setBanner(
        `SEO agent: “${data.draft?.title || "draft"}” queued for HITL (kw: ${data.draft?.primary_keyword || "—"}). ${data.note || ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "SEO agent failed");
    } finally {
      setSeoBusy(false);
    }
  }

  async function runHnAgent() {
    setHnBusy(true);
    setError(null);
    setBanner(null);
    setUpgradeHref(null);
    try {
      const res = await fetch("/api/marketing/agents/hn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 3, enqueue: true }),
      });
      if (!res.ok) await handlePlanFail(res);
      const data = (await res.json()) as {
        error?: string;
        enqueued?: number;
        note?: string;
      };
      setBanner(
        `HN agent: ${data.enqueued ?? 0} comment draft(s) in queue. ${data.note || ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "HN agent failed");
    } finally {
      setHnBusy(false);
    }
  }

  async function runLoop(type: "daily_distribution" | "opportunity") {
    if (type === "opportunity") {
      await runRedditAgent();
      return;
    }
    setLoopBusy(type);
    setError(null);
    setBanner(null);
    try {
      // Daily loop → multi-channel drafts (same as generate)
      const res = await fetch("/api/marketing/draft", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Loop failed");
      }
      setBanner(
        "Daily distribution: 3 channel drafts created. Review in HITL queue — nothing published.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Loop failed");
    } finally {
      setLoopBusy(null);
    }
  }

  async function saveAutonomy(level: AutonomyLevel) {
    setSavingAutonomy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autonomy: level }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Failed to save autonomy");
      }
      const data = (await res.json()) as { autonomy: AutonomyLevel };
      setAutonomy(data.autonomy);
      setBanner(
        `Autonomy set to ${data.autonomy}. Next loop run will respect the dial.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save autonomy");
    } finally {
      setSavingAutonomy(false);
    }
  }

  const busy =
    generating ||
    campaignBusy ||
    redditBusy ||
    seoBusy ||
    hnBusy ||
    dayDraftBusy !== null ||
    loopBusy !== null;

  return (
    <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label mb-2">Marketing fleet</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Studio
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            For SaaS founders, startups, and MSMEs: brand-grounded campaign brief
            + channel drafts (X, LinkedIn, Reddit). Approve before live publish —
            Google Business Profile posts coming soon.
          </p>
          {meterLine ? (
            <p className="mt-2 font-mono text-[11px] text-muted">
              Plan meter · {meterLine}
              {" · "}
              <Link href="/pricing" className="text-accent hover:underline">
                Upgrade
              </Link>
            </p>
          ) : null}
        </div>
        <Link
          href="/app/queue"
          className="font-mono text-[11px] uppercase tracking-widest text-accent hover:underline focus-ring"
        >
          Review queue →
        </Link>
      </div>

      {error ? (
        <div className="panel mt-4 border-danger/40 p-4" role="alert">
          <p className="text-sm text-danger">{error}</p>
          {upgradeHref ? (
            <Link
              href={upgradeHref}
              className="btn-primary focus-ring mt-3 inline-flex !px-3 !py-1.5 text-sm"
            >
              View plans · upgrade
            </Link>
          ) : null}
        </div>
      ) : null}
      {banner ? (
        <p className="mt-4 text-sm text-accent" role="status">
          {banner}
        </p>
      ) : null}

      {brand ? (
        <section className="panel mt-6 border-accent/30 p-5 sm:p-6" aria-label="Create marketing">
          <p className="section-label mb-2 text-accent">Create from brand memory</p>
          <h2 className="font-display text-xl font-semibold">
            What do you want ready for review?
          </h2>
          <div
            className="mt-4 grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Creation mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={creationMode === "drafts"}
              className={`focus-ring border p-4 text-left ${
                creationMode === "drafts"
                  ? "border-accent bg-accent/10"
                  : "border-line bg-bg-elevated"
              }`}
              onClick={() => setCreationMode("drafts")}
            >
              <span className="font-display text-base font-semibold">Channel drafts</span>
              <span className="mt-1 block text-xs text-muted">
                X, LinkedIn, and Reddit drafts grounded in current memory.
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={creationMode === "campaign"}
              className={`focus-ring border p-4 text-left ${
                creationMode === "campaign"
                  ? "border-accent bg-accent/10"
                  : "border-line bg-bg-elevated"
              }`}
              onClick={() => setCreationMode("campaign")}
            >
              <span className="font-display text-base font-semibold">7-day campaign</span>
              <span className="mt-1 block text-xs text-muted">
                A reviewable daily brief; each day is drafted separately.
              </span>
            </button>
          </div>
          <button
            type="button"
            className="btn-primary focus-ring mt-4 w-full justify-center text-sm sm:w-auto"
            onClick={() =>
              creationMode === "drafts"
                ? void generate()
                : void generateCampaign()
            }
            disabled={
              busy ||
              (creationMode === "campaign" && !featureAllowed("campaign"))
            }
            aria-busy={generating || campaignBusy}
          >
            {generating || campaignBusy
              ? creationMode === "drafts"
                ? "Creating drafts…"
                : "Planning campaign…"
              : creationMode === "drafts"
                ? "Create 3 drafts"
                : featureAllowed("campaign")
                  ? "Create campaign brief"
                  : "Campaign · Starter+"}
          </button>
          <p className="mt-2 text-xs text-muted">
            Output goes to review. Nothing is provider-confirmed published from this action.
          </p>

          <details className="mt-5 border-t border-line pt-4">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted hover:text-ink">
              Advanced workflows · Reddit, HN, SEO
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={() => void runRedditAgent()}
                disabled={busy || !featureAllowed("reddit_agent")}
                title={featureTitle("reddit_agent", "Find Reddit threads and draft HITL replies")}
              >
                {redditBusy ? "Finding Reddit opportunities…" : "Reddit opportunities"}
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={() => void runHnAgent()}
                disabled={busy || !featureAllowed("hn_agent")}
                title={featureTitle("hn_agent", "HN stories + comment drafts for HITL")}
              >
                {hnBusy ? "Finding HN opportunities…" : "HN opportunities"}
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                onClick={() => void runSeoAgent()}
                disabled={busy || !featureAllowed("seo_agent")}
                title={featureTitle("seo_agent", "Keyword opportunities + long-form SEO draft")}
              >
                {seoBusy ? "Researching SEO…" : "SEO article brief"}
              </button>
            </div>
          </details>
        </section>
      ) : null}

      {!loading && !brand ? (
        <div className="panel mt-6 border-accent/40 p-6 sm:p-8">
          <p className="section-label mb-2 text-accent">Studio needs a brand</p>
          <h2 className="font-display text-xl font-semibold">
            One URL unlocks agents + drafts
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
            Onboarding extracts voice, ICP, and pillars, then can auto-draft
            three channels. Come back here for Reddit · HN · SEO agents and
            the autonomy dial.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/app/onboarding"
              className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            >
              Paste product URL →
            </Link>
            <Link
              href="/app/cmo"
              className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            >
              CMO desk
            </Link>
          </div>
        </div>
      ) : null}

      {campaign ? (
        <section className="panel mt-8 p-4" aria-label="7-day campaign brief">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
            Campaign brief
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold">
            {campaign.title}
          </h2>
          <p className="mt-1 text-sm text-muted">Audience: {campaign.audience}</p>
          <ol className="mt-4 space-y-2">
            {campaign.days.map((d) => (
              <li
                key={d.day}
                className="flex flex-col gap-2 border border-line px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] uppercase text-accent">
                    Day {d.day} · {d.channel}
                  </span>
                  <p className="mt-0.5 font-medium text-ink">{d.goal}</p>
                  <p className="mt-0.5 text-xs text-muted">{d.draft_hint}</p>
                </div>
                <button
                  type="button"
                  className="btn-ghost focus-ring shrink-0 !px-2 !py-1 text-xs"
                  disabled={busy || !brand}
                  onClick={() => void draftCampaignDay(d)}
                  title="Generate one HITL draft for this day"
                >
                  {dayDraftBusy === d.day ? "Drafting…" : "Draft day → queue"}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 font-mono text-[10px] text-muted">{campaign.note}</p>
        </section>
      ) : null}

      <section className="panel mt-8 p-4" aria-label="Agentic loops">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
          Agentic loops
        </p>
        <p className="mt-1 text-sm text-muted">
          Daily multi-channel drafts + Reddit opportunity loop. Live model +
          brand memory required (no templates). L1 pending HITL; L2 auto-queues
          X/LinkedIn only — never fakes published.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void runLoop("daily_distribution")}
            disabled={busy}
            aria-busy={loopBusy === "daily_distribution"}
          >
            {loopBusy === "daily_distribution"
              ? "Running…"
              : "Run Daily Distribution Loop"}
          </button>
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => void runLoop("opportunity")}
            disabled={busy}
            aria-busy={loopBusy === "opportunity"}
          >
            {loopBusy === "opportunity"
              ? "Running…"
              : "Run Opportunity Loop"}
          </button>
        </div>
        {loops.length > 0 ? (
          <ul className="mt-4 space-y-1 font-mono text-[11px] text-muted">
            {loops.map((loop) => (
              <li key={loop.id}>
                {loop.name} · {loop.status}
                {typeof loop.posts_created === "number"
                  ? ` · ${loop.posts_created} posts`
                  : ""}
                {" · "}
                {new Date(loop.started_at).toLocaleString()}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel mt-4 p-4" aria-label="Publishing policy">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
          Publishing policy
        </p>
        <h2 className="mt-1 font-display text-base font-semibold">
          {autonomy === "L1"
            ? "Review every draft"
            : autonomy === "L2"
              ? "Auto-queue low-risk drafts"
              : "Automatic publishing unavailable"}
        </h2>
        <p className="mt-1 text-sm text-muted">{AUTONOMY_HINT[autonomy]}</p>
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label="Autonomy level"
        >
          {AUTONOMY_LEVELS.map((level) => {
            const l2Locked = level === "L2" && !featureAllowed("l2_autonomy");
            const l3Blocked = level === "L3";
            return (
              <button
                key={level}
                type="button"
                className={
                  autonomy === level
                    ? "btn-primary focus-ring !px-3 !py-1.5 text-sm"
                    : "btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                }
                onClick={() => void saveAutonomy(level)}
                disabled={savingAutonomy || l2Locked || l3Blocked}
                aria-pressed={autonomy === level}
                title={
                  l3Blocked
                    ? "L3 auto-publish not available yet"
                    : l2Locked
                      ? featureTitle("l2_autonomy", "L2")
                      : AUTONOMY_HINT[level]
                }
              >
                {level === "L1"
                  ? "Review everything"
                  : level === "L2"
                    ? "Auto-queue low risk"
                    : "Auto-publish"}
                {l2Locked ? " · Growth+" : ""}
                {l3Blocked ? " · soon" : ""}
              </button>
            );
          })}
        </div>
        <p className="mt-2 font-mono text-[10px] text-muted">
          L1 free · L2 auto-queue is Growth+ · L3 blocked. Generate drafts to
          apply L2 when unlocked.
        </p>
      </section>

      <section className="panel mt-8 p-4" aria-label="Brand context">
        {loading && !brand ? (
          <p className="text-sm text-muted">Loading brand…</p>
        ) : brand ? (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              Brand context
            </p>
            <h2 className="mt-1 font-display text-xl font-bold">{brand.name}</h2>
            <p className="mt-1 text-sm text-muted">{brand.oneliner}</p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-mono text-[10px] uppercase text-muted">ICP</dt>
                <dd>{brand.icp}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase text-muted">Tone</dt>
                <dd>{brand.tone}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-mono text-[10px] uppercase text-muted">
                  Pillars
                </dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {brand.pillars.map((p: string) => (
                    <span
                      key={p}
                      className="border border-line px-2 py-0.5 font-mono text-[11px] text-muted"
                    >
                      {p}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="mt-3 min-w-0 font-mono text-[10px] text-muted">
              <a
                href={brand.url}
                className="break-all text-accent hover:underline focus-ring"
                target="_blank"
                rel="noreferrer"
              >
                {brand.url}
              </a>
              {" · "}updated {new Date(brand.updated_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted">
              Brand context will appear here after onboarding. Agents stay
              available once memory is live — we don&apos;t invent a brand.
            </p>
            <Link
              href="/app/onboarding"
              className="btn-primary focus-ring mt-4 inline-flex !px-3 !py-1.5 text-sm"
            >
              Onboard product URL
            </Link>
          </div>
        )}
      </section>

      <section className="mt-8" aria-label="Recent drafts">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Recent drafts</h2>
          <Link
            href="/app/queue"
            className="font-mono text-[11px] uppercase tracking-widest text-accent hover:underline focus-ring"
          >
            Open HITL queue →
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading drafts…</p>
        ) : posts.length === 0 ? (
          <div>
            <p className="text-sm text-muted">
              No drafts yet. Run a loop, generate drafts, or seed the queue.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
                disabled={!!loopBusy || generating}
                onClick={() => void runLoop("daily_distribution")}
              >
                {loopBusy === "daily_distribution"
                  ? "Running…"
                  : "Run Daily Distribution"}
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                disabled={generating || !!loopBusy}
                onClick={() => void generate()}
              >
                {generating ? "Generating…" : "Generate drafts"}
              </button>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {posts.map((post) => (
              <li key={post.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent">
                    {PLATFORM_LABEL[post.platform] ?? post.platform}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-muted">
                    {post.status} · autonomy {post.autonomy}
                  </span>
                </div>
                {post.title ? (
                  <p className="mt-2 text-sm font-medium">{post.title}</p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted line-clamp-4">
                  {post.body}
                </p>
                {post.note ? (
                  <p className="mt-2 font-mono text-[10px] text-warn">
                    {post.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
