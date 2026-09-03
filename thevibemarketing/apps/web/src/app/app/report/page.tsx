"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Report = {
  window: string;
  brand: string | null;
  autonomy: string;
  posts: {
    total_all_time: number;
    created_7d: number;
    by_status: Record<string, number>;
    by_platform: Record<string, number>;
  };
  loops: { runs_7d: number; done: number; failed: number };
  publish: {
    queue_events_7d: number;
    published_posts_7d: number;
    via: { hitl: number; l2: number; l3: number };
    funnel: {
      drafted: number;
      approved_or_queued: number;
      provider_confirmed: number;
    };
    recent: Array<{
      id: string;
      post_id: string;
      platform: string;
      at: string;
      via: string;
      actor: string;
      note: string;
    }>;
  };
  tip: string;
  honest: string;
};

type PlanMeter = {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  period: string;
};

export default function ReportPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [planMeter, setPlanMeter] = useState<PlanMeter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) setRefreshing(true);
    setError(null);
    try {
      const [repRes, billRes] = await Promise.all([
        fetch("/api/marketing/report"),
        fetch("/api/billing/me"),
      ]);
      if (!repRes.ok) throw new Error("Failed to load report");
      setReport((await repRes.json()) as Report);
      if (billRes.ok) {
        const bill = (await billRes.json()) as {
          meter?: {
            label?: string;
            used?: number;
            limit?: number;
            remaining?: number;
            period?: string;
          };
          plan?: { label?: string };
        };
        if (bill.meter) {
          setPlanMeter({
            label: bill.meter.label ?? bill.plan?.label ?? "Free",
            used: bill.meter.used ?? 0,
            limit: bill.meter.limit ?? 0,
            remaining: bill.meter.remaining ?? 0,
            period: bill.meter.period ?? "",
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      if (opts?.refresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <p className="section-label mb-2">LEARN</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Weekly fleet report
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Seven-day workspace activity: drafts, approvals, delivery attempts, and
        provider-confirmed publishes.
      </p>

      {error ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {!report ? (
        <p className="mt-8 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-8 space-y-8">
          <p className="text-sm text-accent">{report.tip}</p>
          <p className="text-xs text-muted">{report.honest}</p>

          <section className="panel border-warn/30 bg-warn/5 p-4">
            <p className="section-label mb-1 text-warn">Outcome analytics unavailable</p>
            <h2 className="font-display text-lg font-semibold">
              Reach, clicks, and conversions are not connected
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              This report shows verified workspace and publishing activity only.
              Connect analytics to measure what happened after a post went live;
              no engagement metrics are estimated or invented.
            </p>
            <Link
              href="/app/connectors"
              className="btn-ghost focus-ring mt-3 inline-flex !px-3 !py-1.5 text-sm"
            >
              Connect analytics
            </Link>
          </section>

          {planMeter ? (
            <section className="panel p-4">
              <p className="section-label mb-1 text-accent">Plan · run meter</p>
              <p className="font-display text-lg font-semibold">
                {planMeter.label}
                <span className="ml-2 font-mono text-sm font-normal text-muted">
                  {planMeter.used}/{planMeter.limit} used
                  {planMeter.period ? ` · ${planMeter.period}` : ""}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {planMeter.remaining} generations left this UTC month. Brand
                extracts, drafts, agents, and chat count toward the meter.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      planMeter.limit > 0
                        ? (planMeter.used / planMeter.limit) * 100
                        : 0,
                    )}%`,
                  }}
                />
              </div>
              {planMeter.remaining <= 5 ? (
                <Link
                  href="/pricing"
                  className="btn-ghost focus-ring mt-3 inline-flex !px-3 !py-1.5 text-sm"
                >
                  Upgrade for more runs
                </Link>
              ) : null}
            </section>
          ) : null}

          <section>
            <h2 className="font-display text-lg font-semibold">7-day snapshot</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="panel px-4 py-3">
                <dt className="text-xs text-muted">Drafts created</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">
                  {report.posts.created_7d}
                </dd>
              </div>
              <div className="panel px-4 py-3">
                <dt className="text-xs text-muted">Queue events</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">
                  {report.publish.queue_events_7d}
                </dd>
              </div>
              <div className="panel px-4 py-3">
                <dt className="text-xs text-muted">Provider-published</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">
                  {report.publish.published_posts_7d}
                </dd>
              </div>
              <div className="panel px-4 py-3">
                <dt className="text-xs text-muted">Loop runs</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">
                  {report.loops.runs_7d}
                </dd>
              </div>
              <div className="panel px-4 py-3">
                <dt className="text-xs text-muted">Autonomy</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">
                  {report.autonomy}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <p className="section-label mb-2">Publishing funnel</p>
            <h2 className="font-display text-lg font-semibold">
              Drafted → approved / queued → provider-confirmed
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Approval records delivery intent. Only the final step confirms that
              a provider accepted and identified the live post.
            </p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Drafted", report.publish.funnel.drafted],
                ["2", "Approved / queued", report.publish.funnel.approved_or_queued],
                ["3", "Provider-confirmed", report.publish.funnel.provider_confirmed],
              ].map(([step, label, value]) => (
                <li key={label} className="panel relative overflow-hidden p-4">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                    Step {step}
                  </span>
                  <p className="mt-1 text-sm text-muted">{label}</p>
                  <p className="font-display text-3xl font-bold tabular-nums text-ink">
                    {value}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <p className="section-label mb-2">Channel breakdown</p>
            <h2 className="font-display text-lg font-semibold">
              Drafts created by channel
            </h2>
            {Object.keys(report.posts.by_platform).length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No channel drafts were created in this window.
              </p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(report.posts.by_platform)
                  .sort(([, a], [, b]) => b - a)
                  .map(([platform, count]) => (
                    <li key={platform} className="panel flex items-center justify-between gap-4 p-4">
                      <span className="font-mono text-xs uppercase tracking-widest text-muted">
                        {platform}
                      </span>
                      <span className="font-display text-2xl font-bold tabular-nums text-ink">
                        {count}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">
              Approval and delivery activity
            </h2>
            <p className="mt-1 text-sm text-muted">
              Queued events: {report.publish.queue_events_7d} · HITL{" "}
              {report.publish.via.hitl} · L2 auto-queue {report.publish.via.l2} ·
              L3 {report.publish.via.l3} (blocked)
            </p>
            {report.publish.recent.length === 0 ? (
              <div className="mt-2">
                <p className="text-sm text-muted">No queue events in window.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href="/app/studio"
                    className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                  >
                    Open Studio
                  </Link>
                  <Link
                    href="/app/queue"
                    className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
                  >
                    HITL queue
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {report.publish.recent.map((l) => (
                  <li key={l.id} className="border-b border-line pb-2 text-sm">
                    <span className="font-mono text-xs text-accent">{l.via}</span>{" "}
                    · {l.platform} · actor {l.actor} ·{" "}
                    {new Date(l.at).toLocaleString()}
                    <p className="text-xs text-muted">{l.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            className="btn-ghost focus-ring"
            disabled={refreshing}
            onClick={() => void load({ refresh: true })}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}
