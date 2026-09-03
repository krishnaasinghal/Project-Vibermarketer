import { writeBrandEpisode } from "@vibe/engine";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/brand-memory-context";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return withMarketingStore(async () => {
    const { id } = await params;
    let note: string | undefined;
    try {
      const body = (await req.json()) as { note?: string };
      if (body.note) note = String(body.note);
    } catch {
      /* empty body ok */
    }

    const store = getMarketingStore();
    const post = await store.rejectPost(id, note);
    if (!post) {
      return NextResponse.json({ error: "post not found" }, { status: 404 });
    }

    // Episodic learn: rejection feedback improves future voice (best-effort).
    const brand = await store.getBrand();
    let episode: { ok: boolean; error?: string } | null = null;
    if (brand) {
      const text =
        note?.trim() ||
        `Rejected ${post.platform} draft (no note). Do not repeat this style: ${post.body.slice(0, 280)}`;
      episode = await writeBrandEpisode({
        ownerId: currentOwnerId(),
        brandName: brand.name,
        kind: "reject",
        text,
        platform: post.platform,
      });
    }

    return NextResponse.json({
      post,
      memory_episode: episode,
    });
  });
}
