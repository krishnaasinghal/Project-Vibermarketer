import { runSeoAgent } from "@vibe/engine";
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

/** SEO agent → keyword list + long-form draft. Growth+ feature. */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    const gated = await assertFeature(ownerId, "seo_agent");
    if (!gated.ok) return gated.response;

    const limited = await checkMarketingExpensiveLimit(ownerId, "seo");
    if (!limited.ok) return limited.response;

    let body: { topic?: string; enqueue?: boolean } = {};
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

    const result = await runSeoAgent({
      brand: toBrandMemoryInput(brand),
      ownerId: currentOwnerId(),
      topic: body.topic,
    });

    if (!result.ok || !result.draft) {
      return NextResponse.json(
        {
          error: result.error || "SEO agent failed",
          keywords: result.keywords,
          note: result.note,
        },
        { status: 502 },
      );
    }

    const posts = [];
    if (body.enqueue !== false) {
      const d = result.draft;
      const queueBody = [
        d.body_markdown,
        "",
        "---",
        `Primary keyword: ${d.primary_keyword}`,
        d.secondary_keywords.length
          ? `Secondary: ${d.secondary_keywords.join(", ")}`
          : "",
        `Meta: ${d.meta_description}`,
        d.outline.length ? `Outline: ${d.outline.join(" · ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const post = await store.upsertPost({
        platform: "website",
        content_type: "blog_article",
        title: d.title,
        body: queueBody,
        status: "pending",
        autonomy: "L1",
        rationale: `SEO agent · keyword=${d.primary_keyword} · research=${result.research_used}`,
        brand: brand.name.toLowerCase().replace(/\s+/g, ""),
        note: `seo_agent · slug:${d.slug} · keyword:${d.primary_keyword}`,
      });
      posts.push(post);

      await store.addLoop({
        id: `loop_seo_${Date.now().toString(36)}`,
        name: "content-draft",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: "done",
        posts_created: 1,
        note: `SEO agent · ${d.slug}`,
      });
    }

    const meter = await recordGeneration("seo");

    return NextResponse.json({
      ok: true,
      agent: "seo",
      keywords: result.keywords,
      draft: result.draft,
      research_used: result.research_used,
      posts,
      note: result.note,
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
      },
    });
  });
}
