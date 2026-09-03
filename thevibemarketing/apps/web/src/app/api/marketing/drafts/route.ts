import { NextResponse } from "next/server";
import {
  getMarketingStore,
  type Platform,
  type PostStatus,
} from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

const PLATFORMS = new Set<Platform>(["x", "linkedin", "reddit"]);

/** Alias of /api/marketing/posts for older clients. */
export async function GET(req: Request) {
  return withMarketingStore(async () => {
    const status = new URL(req.url).searchParams.get(
      "status",
    ) as PostStatus | null;
    const store = getMarketingStore();
    const posts = await store.listPosts(status || undefined);
    return NextResponse.json({ drafts: posts, posts });
  });
}

export async function POST(req: Request) {
  return withMarketingStore(async () => {
    try {
      const body = (await req.json()) as {
        channel?: string;
        platform?: string;
        title?: string;
        body?: string;
      };
      const platform = (body.platform || body.channel) as Platform | undefined;
      const content = typeof body.body === "string" ? body.body.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!platform || !PLATFORMS.has(platform) || !content) {
        return NextResponse.json(
          { error: "platform/channel (x|linkedin|reddit) and body required" },
          { status: 400 },
        );
      }
      if (content.length > 20_000 || title.length > 300) {
        return NextResponse.json(
          { error: "body must be at most 20,000 characters and title at most 300 characters" },
          { status: 400 },
        );
      }
      const store = getMarketingStore();
      const post = await store.upsertPost({
        platform,
        title: title || null,
        body: content,
        status: "pending",
        autonomy: "L1",
        rationale: "Human-authored draft",
        note: "human_manual",
      });
      return NextResponse.json({ draft: post, post });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "failed" },
        { status: 500 },
      );
    }
  });
}
