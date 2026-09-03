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
 * Live loops:
 * - opportunity → Reddit agent (HITL drafts only) — Starter+
 * - daily_distribution → use POST /api/marketing/draft (redirect clients)
 */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    // Opportunity loop is Reddit-based → same gate as reddit agent
    const gated = await assertFeature(ownerId, "reddit_agent");
    if (!gated.ok) return gated.response;

    const limited = await checkMarketingExpensiveLimit(ownerId, "loop");
    if (!limited.ok) return limited.response;

    let body: { type?: string } = {};
    try {
      body = (await req.json()) as { type?: string };
    } catch {
      body = {};
    }

    const type = body.type || "opportunity";

    if (type === "daily_distribution") {
      return NextResponse.json(
        {
          error:
            "Use POST /api/marketing/draft for daily multi-channel drafts (live OpenAI + brand memory).",
          redirect: "/api/marketing/draft",
        },
        { status: 400 },
      );
    }

    if (type !== "opportunity") {
      return NextResponse.json({ error: "unknown loop type" }, { status: 400 });
    }

    const store = getMarketingStore();
    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        { error: "Brand required — complete onboarding first" },
        { status: 400 },
      );
    }

    const result = await runRedditAgent({
      brand: toBrandMemoryInput(brand),
      ownerId: currentOwnerId(),
      limit: 4,
    });

    if (!result.ok || !result.opportunities.length) {
      return NextResponse.json(
        {
          error: result.error || "No Reddit opportunities",
          queries: result.queries,
        },
        { status: 502 },
      );
    }

    const posts = [];
    for (const op of result.opportunities) {
      posts.push(
        await store.upsertPost({
          platform: "reddit",
          title: `r/${op.thread.subreddit}: ${op.thread.title.slice(0, 80)}`,
          body: op.draft_reply,
          status: "pending",
          autonomy: "L1",
          rationale: op.why,
          brand: brand.name.toLowerCase().replace(/\s+/g, ""),
          note: `reddit_agent · risk=${op.risk} · subreddit:${op.thread.subreddit} · thread:${op.thread.permalink}`,
        }),
      );
    }

    await store.addLoop({
      id: `loop_opp_${Date.now().toString(36)}`,
      name: "opportunity",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: "done",
      posts_created: posts.length,
      note: "Reddit opportunity loop · HITL only",
    });

    const meter = await recordGeneration("loop");

    return NextResponse.json({
      posts,
      auto_queued: 0,
      stub: false,
      agent: "reddit",
      note: result.note,
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
      },
    });
  });
}
