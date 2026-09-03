import {
  isSupermemoryConfigured,
  recallBrandMemory,
  syncBrandMemory,
  writeBrandEpisode,
  type BrandRecallTask,
  type BrandFact,
  type BrandFactStatus,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import {
  currentOwnerId,
  toBrandMemoryInput,
} from "@/lib/brand-memory-context";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 45;

const TASKS = new Set<BrandRecallTask>([
  "general",
  "draft_x",
  "draft_linkedin",
  "draft_reddit",
  "campaign",
  "reject_review",
]);

const FACT_STATUSES = new Set<BrandFactStatus>([
  "pending",
  "verified",
  "rejected",
]);

/** GET — status + task-aware recall for current brand. */
export async function GET(req: Request) {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const brand = await store.getBrand();
    const configured = isSupermemoryConfigured();
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || undefined;
    const taskRaw = url.searchParams.get("task") || "general";
    const task = TASKS.has(taskRaw as BrandRecallTask)
      ? (taskRaw as BrandRecallTask)
      : "general";
    const ownerId = currentOwnerId();

    if (!brand) {
      return NextResponse.json({
        configured,
        brand: null,
        ownerId: ownerId.slice(0, 8) + "…",
        architecture: {
          source_of_truth: "marketing_state.brand",
          retrieval: "supermemory",
          layers: ["core", "semantic", "episodic"],
        },
        note: "No brand yet — run onboarding first.",
      });
    }

    const recall = await recallBrandMemory({
      brandName: brand.name,
      ownerId,
      brand: toBrandMemoryInput(brand),
      q,
      task,
    });

    return NextResponse.json({
      configured,
      brand: {
        name: brand.name,
        url: brand.url,
        never_say: brand.never_say ?? [],
        audience_notes: brand.audience_notes ?? null,
        facts: brand.facts ?? [],
        memory: brand.memory ?? null,
      },
      containerTag: recall.containerTag,
      task: recall.task,
      coreLines: recall.coreLines,
      contextLines: recall.contextLines,
      staticFacts: recall.profile.staticFacts,
      dynamicFacts: recall.profile.dynamicFacts,
      hits: recall.search.hits,
      layers: recall.layers,
      live: recall.configured && recall.contextLines.length > 0,
      architecture: {
        source_of_truth: "marketing_state.brand",
        retrieval: "supermemory",
        multi_tenant: true,
        container: recall.containerTag,
      },
      note: !configured
        ? "SUPERMEMORY_API_KEY unset — core brand lines still available from SoT"
        : recall.contextLines.length
          ? "Layered recall: core (SoT) + SuperMemory semantic/episodic"
          : "Key set but empty index — POST sync or complete onboarding",
    });
  });
}

/** POST — sync brand index, or write an episode (HITL learning). */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    let body: {
      markdown?: string;
      q?: string;
      task?: string;
      episode?: {
        kind?: string;
        text?: string;
        platform?: string;
      };
    } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }

    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        { error: "No brand in store — complete onboarding first" },
        { status: 400 },
      );
    }

    const ownerId = currentOwnerId();

    // Episodic write path
    if (body.episode?.text) {
      const kind = body.episode.kind || "user_note";
      const allowed = new Set([
        "reject",
        "approve",
        "publish",
        "user_note",
        "channel_note",
      ]);
      if (!allowed.has(kind)) {
        return NextResponse.json({ error: "invalid episode.kind" }, { status: 400 });
      }
      const episode = await writeBrandEpisode({
        ownerId,
        brandName: brand.name,
        kind: kind as "reject" | "approve" | "publish" | "user_note" | "channel_note",
        text: body.episode.text,
        platform: body.episode.platform,
      });
      if (!episode.ok) {
        return NextResponse.json(
          { error: episode.error || "Episode write failed" },
          { status: 502 },
        );
      }
      return NextResponse.json({ episode, ok: true });
    }

    const sync = await syncBrandMemory(
      toBrandMemoryInput(brand, { markdown: body.markdown }),
      { ownerId },
    );

    if (sync.factsOk) {
      await store.setBrandMemoryMeta({
        container_tag: sync.containerTag,
        last_synced_at: new Date().toISOString(),
        fact_count: sync.factCount,
      });
    }

    const taskRaw = body.task || "general";
    const task = TASKS.has(taskRaw as BrandRecallTask)
      ? (taskRaw as BrandRecallTask)
      : "general";

    const recall = await recallBrandMemory({
      brandName: brand.name,
      ownerId,
      brand: toBrandMemoryInput(brand),
      q: body.q || undefined,
      task,
    });

    if (!sync.factsOk && isSupermemoryConfigured()) {
      return NextResponse.json(
        { error: sync.error || "Live Supermemory sync failed." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      sync,
      recall: {
        containerTag: recall.containerTag,
        task: recall.task,
        coreLines: recall.coreLines,
        contextLines: recall.contextLines,
        layers: recall.layers,
        hitCount: recall.search.hits.length,
      },
      live: sync.factsOk,
    });
  });
}

/** PATCH — HITL verify/reject extracted or researched brand facts. */
export async function PATCH(req: Request) {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        { error: "No brand in store — complete onboarding first" },
        { status: 400 },
      );
    }

    let body: {
      fact_id?: string;
      status?: string;
      note?: string | null;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const factId = String(body.fact_id || "").trim();
    const status = String(body.status || "").trim() as BrandFactStatus;
    if (!factId || !FACT_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "fact_id and status (pending|verified|rejected) are required" },
        { status: 400 },
      );
    }

    const facts = brand.facts ?? [];
    const index = facts.findIndex((fact) => fact.id === factId);
    if (index < 0) {
      return NextResponse.json({ error: "fact not found" }, { status: 404 });
    }

    const nextFacts: BrandFact[] = facts.map((fact) =>
      fact.id === factId
        ? {
            ...fact,
            status,
            note:
              body.note !== undefined
                ? String(body.note || "").trim() || null
                : fact.note ?? null,
            verified_at:
              status === "verified" ? new Date().toISOString() : null,
          }
        : fact,
    );

    const updatedBrand = await store.setBrandFacts(nextFacts);
    const sync = await syncBrandMemory(toBrandMemoryInput({
      ...brand,
      facts: nextFacts,
    }), {
      ownerId: currentOwnerId(),
    });

    if (sync.factsOk) {
      await store.setBrandMemoryMeta({
        container_tag: sync.containerTag,
        last_synced_at: new Date().toISOString(),
        fact_count: sync.factCount,
      });
    }

    return NextResponse.json({
      ok: true,
      brand: updatedBrand,
      fact: nextFacts[index],
      sync: {
        configured: sync.configured,
        ok: sync.factsOk,
        containerTag: sync.containerTag,
        factCount: sync.factCount,
        error: sync.error,
      },
    });
  });
}
