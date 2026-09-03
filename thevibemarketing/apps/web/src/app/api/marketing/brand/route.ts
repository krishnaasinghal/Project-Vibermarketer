import { syncBrandMemory } from "@vibe/engine";
import { NextResponse } from "next/server";
import {
  currentOwnerId,
  toBrandMemoryInput,
} from "@/lib/brand-memory-context";
import { getMarketingStore, type BrandContext } from "@/lib/marketing-store";
import { normalizeHttpUrl } from "@/lib/url";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const brand = await store.getBrand();
    return NextResponse.json({ brand });
  });
}

export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const body = (await req.json()) as Partial<BrandContext>;
    const url = normalizeHttpUrl(String(body.url || ""));
    const pillars = Array.isArray(body.pillars)
      ? body.pillars.map(String).map((p) => p.trim()).filter(Boolean).slice(0, 6)
      : [];
    if (
      !url ||
      typeof body.name !== "string" || !body.name.trim() ||
      typeof body.oneliner !== "string" || !body.oneliner.trim() ||
      typeof body.icp !== "string" || !body.icp.trim() ||
      typeof body.tone !== "string" || !body.tone.trim() ||
      pillars.length === 0
    ) {
      return NextResponse.json(
        { error: "url, name, oneliner, ICP, tone, and at least one pillar are required." },
        { status: 400 },
      );
    }

    const never_say = Array.isArray(body.never_say)
      ? body.never_say.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : undefined;
    const audience_notes =
      typeof body.audience_notes === "string" ? body.audience_notes.trim() : undefined;

    const candidate = {
      url,
      name: body.name.trim(),
      oneliner: body.oneliner.trim(),
      icp: body.icp.trim(),
      tone: body.tone.trim(),
      pillars,
      never_say,
      audience_notes,
    };

    const ownerId = currentOwnerId();
    const supermemory = await syncBrandMemory(toBrandMemoryInput(candidate), {
      ownerId,
    });
    if (!supermemory.factsOk) {
      return NextResponse.json(
        { error: `Live Supermemory sync failed: ${supermemory.error || "no facts persisted"}` },
        { status: 502 },
      );
    }

    const store = getMarketingStore();
    const brand = await store.setBrand({
      ...candidate,
      memory: {
        container_tag: supermemory.containerTag,
        last_synced_at: new Date().toISOString(),
        fact_count: supermemory.factCount,
      },
    });

    return NextResponse.json({ brand, supermemory });
  });
}
