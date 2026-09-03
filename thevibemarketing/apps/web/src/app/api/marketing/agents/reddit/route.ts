import { runRedditAgent } from "@vibe/engine";
import { NextResponse } from "next/server";
import {
  currentOwnerId,
  toBrandMemoryInput,
} from "@/lib/brand-memory-context";
import {
  checkMarketingExpensiveLimit,
  recordGeneration,
} from "@/lib/marketing-approve";
import { assertFeature } from "@/lib/payments/feature-gates";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Reddit agent: search public Reddit → draft HITL replies → enqueue as pending.
 * Never posts. Never marks published. Starter+ feature.
 */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    const gated = await assertFeature(ownerId, "reddit_agent");
    if (!gated.ok) return gated.response;

    const limited = await checkMarketingExpensiveLimit(ownerId, "reddit");
    if (!limited.ok) return limited.response;

    let body: { limit?: number; extraQueries?: string[]; enqueue?: boolean } =
      {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }

    const store = getMarketingStore();
    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        {
          error:
            "Set brand first (onboarding) so the Reddit agent knows ICP and voice.",
        },
        { status: 400 },
      );
    }

    const result = await runRedditAgent({
      brand: toBrandMemoryInput(brand),
      ownerId,
      limit: body.limit ?? 4,
      extraQueries: body.extraQueries,
    });

    if (!result.ok || result.opportunities.length === 0) {
      return NextResponse.json(
        {
          error: result.error || "No opportunities",
          queries: result.queries,
          note: result.note,
        },
        { status: 502 },
      );
    }

    const enqueue = body.enqueue !== false;
    const posts = [];
    if (enqueue) {
      for (const op of result.opportunities) {
        const post = await store.upsertPost({
          platform: "reddit",
          title: `r/${op.thread.subreddit}: ${op.thread.title.slice(0, 80)}`,
          body: op.draft_reply,
          status: "pending",
          autonomy: "L1",
          rationale: op.why,
          brand: brand.name.toLowerCase().replace(/\s+/g, ""),
          note: `reddit_agent · risk=${op.risk} · subreddit:${op.thread.subreddit} · thread:${op.thread.permalink}`,
        });
        posts.push(post);
      }

      await store.addLoop({
        id: `loop_reddit_${Date.now().toString(36)}`,
        name: "opportunity",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: "done",
        posts_created: posts.length,
        note: `Reddit agent · ${posts.length} HITL drafts · never auto-posted`,
      });
    }

    const meter = await recordGeneration("reddit");

    return NextResponse.json({
      ok: true,
      agent: "reddit",
      queries: result.queries,
      opportunities: result.opportunities.map((op) => ({
        subreddit: op.thread.subreddit,
        title: op.thread.title,
        permalink: op.thread.permalink,
        score: op.thread.score,
        comments: op.thread.num_comments,
        why: op.why,
        risk: op.risk,
        draft_preview: op.draft_reply.slice(0, 200),
      })),
      posts,
      enqueued: posts.length,
      note: result.note,
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
      },
    });
  });
}
