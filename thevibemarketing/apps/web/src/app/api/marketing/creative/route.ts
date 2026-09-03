/**
 * Grok Imagine — social creative for a HITL draft.
 * POST { post_id } → attaches media_url when XAI_API_KEY works.
 * Never claims the image was published.
 */
import {
  buildSocialCreativePrompt,
  generateImage,
  isXaiConfigured,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/brand-memory-context";
import {
  checkMarketingExpensiveLimit,
  recordGeneration,
} from "@/lib/marketing-approve";
import { assertFeature } from "@/lib/payments/feature-gates";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    const gated = await assertFeature(ownerId, "creative");
    if (!gated.ok) return gated.response;

    const limited = await checkMarketingExpensiveLimit(ownerId, "creative");
    if (!limited.ok) return limited.response;

    if (!isXaiConfigured()) {
      return NextResponse.json(
        {
          error:
            "XAI_API_KEY required for Grok Imagine creatives. Set it in env — we do not invent image URLs.",
          configured: false,
        },
        { status: 503 },
      );
    }

    let postId = "";
    try {
      const body = (await req.json()) as { post_id?: string; postId?: string };
      postId = (body.post_id || body.postId || "").trim();
    } catch {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!postId) {
      return NextResponse.json({ error: "post_id required" }, { status: 400 });
    }

    const store = getMarketingStore();
    const posts = await store.listPosts();
    const post = posts.find((p) => p.id === postId);
    if (!post) {
      return NextResponse.json({ error: "post not found" }, { status: 404 });
    }

    const brand = await store.getBrand();
    const prompt = buildSocialCreativePrompt({
      brandName: brand?.name || post.brand,
      oneliner: brand?.oneliner || "",
      tone: brand?.tone || "direct",
      platform: post.platform,
      postBody: post.body,
    });

    const aspect =
      post.platform === "linkedin"
        ? "1:1"
        : post.platform === "x"
          ? "16:9"
          : "1:1";

    const img = await generateImage({ prompt, aspectRatio: aspect });
    if (!img.ok) {
      return NextResponse.json(
        { error: img.error || "Imagine failed", configured: true },
        { status: img.http && img.http >= 400 ? img.http : 502 },
      );
    }

    const mediaUrl =
      img.url ||
      (img.b64 ? `data:image/jpeg;base64,${img.b64}` : null);
    if (!mediaUrl) {
      return NextResponse.json(
        { error: "Imagine returned empty media" },
        { status: 502 },
      );
    }

    const updated = await store.upsertPost({
      id: post.id,
      platform: post.platform,
      body: post.body,
      title: post.title,
      status: post.status,
      autonomy: post.autonomy,
      rationale: post.rationale,
      note: [post.note, `creative:grok-imagine`].filter(Boolean).join(" · "),
      media_url: mediaUrl,
      brand: post.brand,
    });

    const meter = await recordGeneration("creative");

    return NextResponse.json({
      post: updated,
      media_url: mediaUrl,
      model: img.model,
      note: "Creative attached to draft only — not published.",
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
      },
    });
  });
}

export async function GET() {
  return NextResponse.json({
    configured: isXaiConfigured(),
    capability: "Grok Imagine social creatives for HITL drafts",
  });
}
