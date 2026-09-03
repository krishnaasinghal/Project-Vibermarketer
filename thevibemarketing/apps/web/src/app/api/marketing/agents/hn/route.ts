import { runHnAgent } from "@vibe/engine";
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

/** HN agent → comment drafts in HITL queue. Growth+ feature. */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    const gated = await assertFeature(ownerId, "hn_agent");
    if (!gated.ok) return gated.response;

    const limited = await checkMarketingExpensiveLimit(ownerId, "hn");
    if (!limited.ok) return limited.response;

    let body: { limit?: number; enqueue?: boolean } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }

    const store = getMarketingStore();
    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        { error: "Brand required — complete onboarding first" },
        { status: 400 },
      );
    }

    const result = await runHnAgent({
      brand: toBrandMemoryInput(brand),
      ownerId: currentOwnerId(),
      limit: body.limit ?? 3,
    });

    if (!result.ok || !result.opportunities.length) {
      return NextResponse.json(
        {
          error: result.error || "No HN opportunities",
          queries: result.queries,
          note: result.note,
        },
        { status: 502 },
      );
    }

    const posts = [];
    if (body.enqueue !== false) {
      for (const op of result.opportunities) {
        posts.push(
          await store.upsertPost({
            platform: "hacker_news",
            content_type: "hn_comment",
            title: `HN: ${op.story.title.slice(0, 80)}`,
            body: op.draft_comment,
            status: "pending",
            autonomy: "L1",
            rationale: op.why,
            brand: brand.name.toLowerCase().replace(/\s+/g, ""),
            note: `hn_agent · risk=${op.risk} · story:${op.story.url}`,
          }),
        );
      }
      await store.addLoop({
        id: `loop_hn_${Date.now().toString(36)}`,
        name: "opportunity",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: "done",
        posts_created: posts.length,
        note: "HN agent · HITL only",
      });
    }

    const meter = await recordGeneration("hn");

    return NextResponse.json({
      ok: true,
      agent: "hn",
      queries: result.queries,
      opportunities: result.opportunities.map((op) => ({
        title: op.story.title,
        url: op.story.url,
        points: op.story.points,
        why: op.why,
        risk: op.risk,
        draft_preview: op.draft_comment.slice(0, 200),
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
