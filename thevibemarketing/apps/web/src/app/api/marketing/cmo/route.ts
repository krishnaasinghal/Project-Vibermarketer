import {
  fetchPageSpeed,
  isPageSpeedConfigured,
  MARKETING_AGENT_CATALOG,
  runSiteScorecard,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import { getMarketingStore, type Post } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 90;

function countByNote(posts: Post[], prefix: string): number {
  return posts.filter(
    (p) =>
      (p.status === "pending" || p.status === "queued") &&
      (p.note?.includes(prefix) || p.rationale?.toLowerCase().includes(prefix)),
  ).length;
}

/**
 * CMO dashboard aggregate — brand, agent feed counts, scorecard, docs.
 * Query ?audit=1 to refresh site scorecard (+ PageSpeed if key set).
 */
export async function GET(req: Request) {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const url = new URL(req.url);
    const doAudit = url.searchParams.get("audit") === "1";

    const [brand, posts, campaign, loops, publishLog, autonomy] =
      await Promise.all([
        store.getBrand(),
        store.listPosts(),
        store.getCampaign(),
        store.listLoops(),
        store.listPublishLog(20),
        store.getAutonomy(),
      ]);

    const pending = posts.filter((p) => p.status === "pending");
    const queued = posts.filter((p) => p.status === "queued");
    const published = posts.filter((p) => p.status === "published");

    const agentFeed = [
      {
        id: "reddit",
        name: "Reddit Agent",
        status: "live" as const,
        ready: countByNote(posts, "reddit_agent") || countByNote(posts, "subreddit:"),
        cta: { label: "Run Reddit", href: "/app/studio", action: "reddit" },
        blurb: "Thread opportunities → HITL replies",
      },
      {
        id: "hn",
        name: "Hacker News Agent",
        status: "live" as const,
        ready: countByNote(posts, "hn_agent"),
        cta: { label: "Run HN", href: "/app/studio", action: "hn" },
        blurb: "Stories + comment drafts",
      },
      {
        id: "seo",
        name: "SEO Agent",
        status: "live" as const,
        ready: countByNote(posts, "seo_agent"),
        cta: { label: "Run SEO", href: "/app/studio", action: "seo" },
        blurb: "Keywords + long-form draft",
      },
      {
        id: "social",
        name: "Social drafts",
        status: "live" as const,
        ready: pending.filter(
          (p) =>
            !p.note?.includes("seo_agent") &&
            !p.note?.includes("reddit_agent") &&
            !p.note?.includes("hn_agent"),
        ).length,
        cta: { label: "Studio", href: "/app/studio", action: "draft" },
        blurb: "X · LinkedIn · Reddit channel drafts",
      },
      {
        id: "queue",
        name: "HITL queue",
        status: "live" as const,
        ready: pending.length,
        cta: { label: "Open queue", href: "/app/queue", action: "queue" },
        blurb: `${queued.length} queued · ${published.length} published`,
      },
      {
        id: "geo",
        name: "GEO / Site health",
        status: "live" as const,
        ready: brand?.last_audit ? 1 : 0,
        cta: {
          label: "Audit site",
          href: "/app/cmo?audit=1",
          action: "audit",
        },
        blurb: "llms.txt · schema · Lighthouse-style scores",
      },
      {
        id: "ugc",
        name: "UGC / Video",
        status: "partial" as const,
        ready: 0,
        cta: { label: "Remotion promo", href: "/product", action: null },
        blurb: "Brand promo pipeline shipped · productize next",
      },
      {
        id: "influencer",
        name: "Influencer Agent",
        status: "later" as const,
        ready: 0,
        cta: { label: "Soon", href: "/product#fleet", action: null },
        blurb: "Creator outreach — later (human-sent)",
      },
    ];

    const documents = [
      {
        id: "product",
        title: "Product Information",
        status: brand ? "ready" : "empty",
        body: brand
          ? `${brand.name} — ${brand.oneliner}\n\n${brand.description || ""}\n\nICP: ${brand.icp}\nTone: ${brand.tone}\nPillars: ${brand.pillars.join(", ")}`
          : "Complete onboarding to generate.",
        href: "/app/onboarding",
      },
      {
        id: "strategy",
        title: "Marketing Strategy",
        status: campaign ? "ready" : "empty",
        body: campaign
          ? `${campaign.title}\n${campaign.note}\nAudience: ${campaign.audience}\nDays: ${campaign.days.length}`
          : "Run 7-day campaign brief in Studio.",
        href: "/app/studio",
      },
      {
        id: "voice",
        title: "Brand Voice Guide",
        status: brand ? "ready" : "empty",
        body: brand
          ? `Tone: ${brand.tone}\nNever say: ${(brand.never_say || []).join("; ") || "—"}\nMemory: ${brand.memory?.container_tag || "not synced"}`
          : "Brand memory not set.",
        href: "/app/memory",
      },
      {
        id: "competitors",
        title: "Competitor Analysis",
        status: brand?.competitors?.length ? "ready" : "empty",
        body: brand?.competitors?.length
          ? brand.competitors.join("\n")
          : "Add competitors from CMO dashboard.",
        href: "/app/cmo",
      },
    ];

    let scorecard = null as Awaited<
      ReturnType<typeof runSiteScorecard>
    > | null;
    let pagespeed: {
      mobile: Awaited<ReturnType<typeof fetchPageSpeed>>;
      desktop: Awaited<ReturnType<typeof fetchPageSpeed>>;
      configured: boolean;
    } | null = null;

    if (doAudit && brand?.url) {
      scorecard = await runSiteScorecard(brand.url);
      await store.setBrand({
        ...brand,
        last_audit: {
          at: scorecard.measured_at,
          overall: scorecard.scores.overall,
          seo: scorecard.scores.seo,
          geo: scorecard.scores.geo,
          url: scorecard.url,
        },
      });
      if (isPageSpeedConfigured()) {
        const [mobile, desktop] = await Promise.all([
          fetchPageSpeed(brand.url, "mobile"),
          fetchPageSpeed(brand.url, "desktop"),
        ]);
        pagespeed = {
          mobile,
          desktop,
          configured: true,
        };
      } else {
        pagespeed = { mobile: null, desktop: null, configured: false };
      }
    }

    return NextResponse.json({
      ok: true,
      brand,
      autonomy,
      stats: {
        pending: pending.length,
        queued: queued.length,
        published: published.length,
        loops: loops.length,
        publish_log: publishLog.length,
      },
      agent_feed: agentFeed,
      documents,
      campaign,
      recent_posts: posts.slice(0, 8),
      catalog: MARKETING_AGENT_CATALOG.filter((a) =>
        ["live", "partial", "next"].includes(a.status),
      ),
      scorecard,
      pagespeed,
      pagespeed_configured: isPageSpeedConfigured(),
      last_audit: brand?.last_audit ?? null,
      cmo_intro:
        brand
          ? `hi, i'm your cmo for ${brand.name}. every day i can surface: seo/geo fixes, reddit + hn opportunities, social drafts, and one long-form piece — all hitl. let's grow.`
          : "hi, i'm your cmo. paste your product url in onboarding and i'll set up brand memory, site health, and the agent feed.",
    });
  });
}

/** PATCH brand extras: competitors, description */
export async function PATCH(req: Request) {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        { error: "Brand required — onboard first" },
        { status: 400 },
      );
    }
    const body = (await req.json()) as {
      competitors?: string[];
      description?: string;
    };
    const next = await store.setBrand({
      ...brand,
      competitors: body.competitors ?? brand.competitors,
      description:
        body.description !== undefined ? body.description : brand.description,
    });
    return NextResponse.json({ brand: next });
  });
}
