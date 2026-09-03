import { NextResponse } from "next/server";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

/**
 * Daily CMO digest — what a paid CMO would push today.
 * Plan (not cron yet): SEO/GEO fixes, queue counts, suggested agent runs.
 */
export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const brand = await store.getBrand();
    const posts = await store.listPosts();
    const pending = posts.filter((p) => p.status === "pending");
    const queued = posts.filter((p) => p.status === "queued");
    const published = posts.filter((p) => p.status === "published");

    const byAgent = {
      reddit: pending.filter((p) => p.note?.includes("reddit_agent")).length,
      hn: pending.filter((p) => p.note?.includes("hn_agent")).length,
      seo: pending.filter((p) => p.note?.includes("seo_agent")).length,
      social: pending.filter(
        (p) =>
          !p.note?.includes("reddit_agent") &&
          !p.note?.includes("hn_agent") &&
          !p.note?.includes("seo_agent"),
      ).length,
    };

    const checklist = [
      {
        id: "geo",
        title: "Review GEO / site health",
        done: Boolean(brand?.last_audit),
        action: { label: "Open CMO audit", href: "/app/cmo" },
        detail: brand?.last_audit
          ? `Last overall ${brand.last_audit.overall} · SEO ${brand.last_audit.seo} · GEO ${brand.last_audit.geo}`
          : "Run Refresh audit on CMO desk",
      },
      {
        id: "seo_draft",
        title: "1 written article (SEO agent)",
        done: byAgent.seo > 0 || published.some((p) => p.note?.includes("seo")),
        action: { label: "Run SEO agent", href: "/app/studio" },
        detail:
          byAgent.seo > 0
            ? `${byAgent.seo} SEO draft(s) in HITL`
            : "Generate long-form from brand pillars",
      },
      {
        id: "reddit",
        title: "2 Reddit opportunities",
        done: byAgent.reddit >= 2,
        action: { label: "Run Reddit agent", href: "/app/studio" },
        detail:
          byAgent.reddit > 0
            ? `${byAgent.reddit} reply draft(s) pending`
            : "Find threads + draft HITL replies",
      },
      {
        id: "social",
        title: "1 social draft (X / LinkedIn)",
        done: byAgent.social > 0,
        action: { label: "Generate drafts", href: "/app/studio" },
        detail:
          byAgent.social > 0
            ? `${byAgent.social} channel draft(s) pending`
            : "Run Generate 3 drafts",
      },
      {
        id: "hitl",
        title: "Clear HITL queue",
        done: pending.length === 0,
        action: { label: "Open queue", href: "/app/queue" },
        detail: `${pending.length} pending · ${queued.length} queued · ${published.length} published`,
      },
    ];

    const lines = [
      brand
        ? `Daily CMO plan for ${brand.name}`
        : "Daily CMO plan — onboard a brand first",
      "",
      "Today's stack (Okara-style, HITL always):",
      "· 2 SEO / GEO issues to fix (audit)",
      "· 1 written article (SEO agent)",
      "· 2 Reddit opportunities",
      "· 1 social draft (X/LinkedIn)",
      "· Clear approval queue",
      "",
      `Queue: ${pending.length} pending · ${queued.length} queued · ${published.length} published`,
    ];

    return NextResponse.json({
      ok: true,
      brand: brand
        ? { name: brand.name, url: brand.url, oneliner: brand.oneliner }
        : null,
      checklist,
      by_agent: byAgent,
      stats: {
        pending: pending.length,
        queued: queued.length,
        published: published.length,
      },
      narrative: lines.join("\n"),
      note: "Cron/email delivery later — this is the live plan endpoint for the CMO desk.",
    });
  });
}
