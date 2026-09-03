import { NextResponse } from "next/server";
import { isProviderConfirmedPost } from "@/lib/marketing-report";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

/** LEARN step — weekly rollup from marketing store (no fake analytics). */
export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const [posts, loops, publishLog, autonomy, brand] = await Promise.all([
      store.listPosts(),
      store.listLoops(),
      store.listPublishLog(100),
      store.getAutonomy(),
      store.getBrand(),
    ]);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const inWeek = (iso: string) => new Date(iso).getTime() >= weekAgo;

    const postsWeek = posts.filter((p) => inWeek(p.created_at));
    const providerConfirmedCreatedWeek = postsWeek.filter(
      isProviderConfirmedPost,
    );
    const unverifiedPublishedWeek = postsWeek.filter(
      (p) => p.status === "published" && !isProviderConfirmedPost(p),
    );
    const byStatus = {
      pending: postsWeek.filter((p) => p.status === "pending").length,
      approved: postsWeek.filter((p) => p.status === "approved").length,
      rejected: postsWeek.filter((p) => p.status === "rejected").length,
      published: providerConfirmedCreatedWeek.length,
      unverified_published: unverifiedPublishedWeek.length,
      queued: postsWeek.filter((p) => p.status === "queued").length,
    };
    const byPlatform: Record<string, number> = {};
    for (const p of postsWeek) {
      byPlatform[p.platform] = (byPlatform[p.platform] ?? 0) + 1;
    }

    const loopsWeek = loops.filter((l) => inWeek(l.started_at));
    const pubsWeek = publishLog.filter((l) => inWeek(l.at));
    const providerConfirmedWeek = posts.filter(
      (p) =>
        isProviderConfirmedPost(p) && inWeek(p.published_at),
    );
    const approvedOrQueuedWeek = postsWeek.filter(
      (p) =>
        p.status === "approved" ||
        p.status === "queued" ||
        isProviderConfirmedPost(p),
    );

    const tip =
      byStatus.pending > byStatus.published
        ? "HITL queue is backing up — clear pending or raise autonomy for low-risk channels."
        : pubsWeek.length === 0
          ? "No queue activity this week — run Studio drafts, then approve. L2 auto-queues X/LinkedIn only (still not published without a provider id)."
          : "Fleet is shipping drafts. Review publish_log — live social needs a connected account + real provider post id.";

    return NextResponse.json({
      ok: true,
      window: "7d",
      brand: brand?.name ?? null,
      autonomy,
      posts: {
        total_all_time: posts.length,
        created_7d: postsWeek.length,
        by_status: byStatus,
        by_platform: byPlatform,
      },
      loops: {
        runs_7d: loopsWeek.length,
        done: loopsWeek.filter((l) => l.status === "done").length,
        failed: loopsWeek.filter((l) => l.status === "failed").length,
      },
      publish: {
        /** Queue/intent log entries — not a claim of live social posts. */
        queue_events_7d: pubsWeek.length,
        via: {
          hitl: pubsWeek.filter((l) => l.via === "hitl_approve").length,
          l2: pubsWeek.filter((l) => l.via === "l2_auto").length,
          l3: pubsWeek.filter((l) => l.via === "l3_auto").length,
        },
        published_posts_7d: providerConfirmedWeek.length,
        funnel: {
          drafted: postsWeek.length,
          approved_or_queued: approvedOrQueuedWeek.length,
          provider_confirmed: providerConfirmedWeek.length,
        },
        recent: pubsWeek.slice(0, 10).map((event) => ({
          ...event,
          actor: event.actor,
        })),
      },
      tip,
      honest:
        "Workspace activity only. Queued means approved for delivery; provider-confirmed requires a provider post ID and publish timestamp. Rows without that evidence are excluded from published counts. Third-party reach, clicks, and conversions are unavailable until analytics is connected.",
    });
  });
}
