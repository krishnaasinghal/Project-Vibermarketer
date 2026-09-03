"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Snapshot = {
  brand: string | null;
  pending: number;
  queued: number;
  published: number;
  planLabel: string;
  planActive: boolean;
  meterUsed: number;
  meterLimit: number;
  meterPeriod: string;
};

export default function AppHomePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [brandRes, postsRes, billingRes] = await Promise.all([
          fetch("/api/marketing/brand"),
          fetch("/api/marketing/posts"),
          fetch("/api/billing/me"),
        ]);
        if (cancelled) return;
        let brand: string | null = null;
        if (brandRes.ok) {
          const b = (await brandRes.json()) as {
            brand?: { name?: string } | null;
          };
          brand = b.brand?.name ?? null;
        }
        let pending = 0;
        let queued = 0;
        let published = 0;
        if (postsRes.ok) {
          const p = (await postsRes.json()) as {
            posts?: Array<{ status?: string }>;
          };
          for (const post of p.posts ?? []) {
            if (post.status === "pending") pending += 1;
            else if (post.status === "queued") queued += 1;
            else if (post.status === "published") published += 1;
          }
        }
        let planLabel = "Free";
        let planActive = false;
        let meterUsed = 0;
        let meterLimit = 25;
        let meterPeriod = "";
        if (billingRes.ok) {
          const bill = (await billingRes.json()) as {
            plan?: { label?: string; active?: boolean };
            meter?: {
              used?: number;
              limit?: number;
              period?: string;
              label?: string;
            };
          };
          planLabel = bill.plan?.label ?? bill.meter?.label ?? "Free";
          planActive = Boolean(bill.plan?.active);
          meterUsed = bill.meter?.used ?? 0;
          meterLimit = bill.meter?.limit ?? 25;
          meterPeriod = bill.meter?.period ?? "";
        }
        setSnap({
          brand,
          pending,
          queued,
          published,
          planLabel,
          planActive,
          meterUsed,
          meterLimit,
          meterPeriod,
        });
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p className="section-label mb-3">Command center</p>
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        vibemarketer app
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Primary product is the AI CMO desk. VC Brain stays available as the
        founder-sourcing add-on on the same engine.
      </p>

      <div className="panel mt-8 max-w-xl border-accent/40 p-5">
        <p className="section-label mb-1 text-accent">Start here</p>
        <p className="text-sm leading-relaxed text-muted">
          CMO desk · brand · site health · agents feed · chat — inspired by
          modern AI CMO terminals, built for founder HITL.
        </p>
        {snap ? (
          <p className="mt-3 font-mono text-[11px] text-muted">
            Plan{" "}
            <span className={snap.planActive ? "text-ok" : "text-ink"}>
              {snap.planLabel}
              {snap.planActive ? " · active" : ""}
            </span>
            {" · "}
            <span className="text-muted">
              {snap.meterUsed}/{snap.meterLimit} runs
              {snap.meterPeriod ? ` (${snap.meterPeriod})` : ""}
            </span>
            {" · "}
            {snap.brand ? (
              <>
                Brand <span className="text-ink">{snap.brand}</span>
                {" · "}
              </>
            ) : (
              "No brand yet · "
            )}
            <span className="text-accent">{snap.pending}</span> pending
            {" · "}
            <span className="text-warn">{snap.queued}</span> queued
            {" · "}
            <span className="text-ok">{snap.published}</span> published
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/app/cmo" className="btn-primary focus-ring text-sm">
            Open CMO desk
          </Link>
          {snap && snap.pending > 0 ? (
            <Link href="/app/queue" className="btn-ghost focus-ring text-sm">
              Clear queue ({snap.pending})
            </Link>
          ) : (
            <Link
              href="/app/onboarding"
              className="btn-ghost focus-ring text-sm"
            >
              Onboard brand
            </Link>
          )}
          {snap && !snap.planActive ? (
            <Link href="/pricing" className="btn-ghost focus-ring text-sm">
              Upgrade
            </Link>
          ) : null}
        </div>
      </div>

      <p className="section-label mb-3 mt-12">Marketing fleet</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          {
            href: "/app/cmo",
            title: "CMO desk",
            blurb: "Agents feed · GEO scores · chat",
          },
          {
            href: "/app/studio",
            title: "Studio",
            blurb: "Reddit · HN · SEO · social drafts",
          },
          {
            href: "/app/queue",
            title: "HITL queue",
            blurb: "Approve · never fake publish",
          },
          {
            href: "/app/report",
            title: "Weekly report",
            blurb: "LEARN rollup",
          },
        ].map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="panel block p-4 transition hover:border-accent/40"
            >
              <h2 className="font-display text-lg font-semibold text-ink">
                {i.title}
              </h2>
              <p className="mt-1 text-sm text-muted">{i.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="section-label mb-3 mt-12">VC Brain (add-on)</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          {
            href: "/app/radar",
            title: "Founder radar",
            blurb: "Distribution gravity ranking",
          },
          {
            href: "/app/compare",
            title: "Gravity compare",
            blurb: "Cold-start vs pedigree",
          },
        ].map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="panel block p-4 transition hover:border-line"
            >
              <h2 className="font-display text-lg font-semibold text-ink">
                {i.title}
              </h2>
              <p className="mt-1 text-sm text-muted">{i.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
