import { NextResponse } from "next/server";
import {
  getMarketingStore,
  type Platform,
  type PostStatus,
} from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

const PLATFORMS = new Set<Platform>(["x", "linkedin", "reddit"]);
const STATUSES = new Set<PostStatus>([
  "pending",
  "approved",
  "queued",
  "rejected",
  "published",
]);

export async function GET(req: Request) {
  return withMarketingStore(async () => {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    let status: PostStatus | undefined;
    if (statusParam) {
      if (!STATUSES.has(statusParam as PostStatus)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }
      status = statusParam as PostStatus;
    }

    const store = getMarketingStore();
    const posts = await store.listPosts(status);
    return NextResponse.json({ posts });
  });
}

export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const body = (await req.json()) as {
      platform?: string;
      body?: string;
      title?: string;
      rationale?: string;
    };

    if (!body.platform || !PLATFORMS.has(body.platform as Platform)) {
      return NextResponse.json(
        { error: "platform must be x, linkedin, or reddit" },
        { status: 400 },
      );
    }
    if (!body.body || !String(body.body).trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const store = getMarketingStore();
    const post = await store.upsertPost({
      platform: body.platform as Platform,
      body: String(body.body).trim(),
      title: body.title ? String(body.title) : null,
      rationale: body.rationale ?? "Created via API",
      status: "pending",
      autonomy: "L1",
    });

    return NextResponse.json({ post }, { status: 201 });
  });
}
