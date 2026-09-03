import { writeBrandEpisode } from "@vibe/engine";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/brand-memory-context";
import {
  approveMarketingPost,
  approveResultToResponse,
} from "@/lib/marketing-approve";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Edit drafts, reject, or approve (full queue → optional live publish path).
 * Approve matches POST /api/marketing/posts/:id/approve — no silent queue-only.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withMarketingStore(async () => {
    const { id } = await ctx.params;
    let body: {
      action?: "approve" | "reject" | "restore" | "cancel" | "save_draft";
      note?: string;
      title?: string | null;
      body?: string;
      subreddit?: string;
      flairId?: string;
      queueOnly?: boolean;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const store = getMarketingStore();

    if (body.action === "approve") {
      const outcome = await approveMarketingPost(id, {
        subreddit: body.subreddit,
        flairId: body.flairId,
        queueOnly: body.queueOnly === true,
      });
      return approveResultToResponse(outcome);
    }

    if (body.action === "reject") {
      const post = await store.rejectPost(id, body.note);
      if (!post) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      const brand = await store.getBrand();
      let memory_episode: { ok: boolean; error?: string } | null = null;
      if (brand) {
        const text =
          body.note?.trim() ||
          `Rejected ${post.platform} draft (no note). Do not repeat this style: ${post.body.slice(0, 280)}`;
        memory_episode = await writeBrandEpisode({
          ownerId: currentOwnerId(),
          brandName: brand.name,
          kind: "reject",
          text,
          platform: post.platform,
        });
      }
      return NextResponse.json({ draft: post, post, memory_episode });
    }

    if (body.action === "restore") {
      const post = await store.restoreRejectedPost(id);
      if (!post) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({ draft: post, post });
    }

    if (body.action === "cancel") {
      const post = await store.cancelQueuedPost(id);
      if (!post) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({ draft: post, post });
    }

    if (body.action === "save_draft") {
      if (body.body === undefined && body.title === undefined) {
        return NextResponse.json(
          { error: "body or title required for save_draft" },
          { status: 400 },
        );
      }
      const post = await store.updatePendingPostContent(id, {
        body: body.body,
        title: body.title,
      });
      return NextResponse.json({ draft: post, post });
    }

    // Backward-compat action removed: "queue" previously overwrote status to pending.
    if (body.action === "queue") {
      return NextResponse.json(
        {
          error: `Unsupported action: queue. Use action: "save_draft", "reject", "restore", "cancel", or omit action to edit pending content.`,
          code: "UNSUPPORTED_ACTION",
        },
        { status: 400 },
      );
    }

    if (body.title !== undefined || body.body !== undefined) {
      const nextBody = body.body === undefined ? undefined : String(body.body);
      if (nextBody !== undefined && !nextBody.trim()) {
        return NextResponse.json(
          { error: "body cannot be empty" },
          { status: 400 },
        );
      }
      const post = await store.updatePendingPostContent(id, {
        title: body.title,
        body: nextBody,
      });
      return NextResponse.json({ draft: post, post });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  });
}
