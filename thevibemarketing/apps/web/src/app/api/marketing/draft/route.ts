import { randomUUID } from "node:crypto";
import {
  completeJsonDetailed,
  isSupermemoryConfigured,
  recallBrandMemory,
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import {
  currentOwnerId,
  toBrandMemoryInput,
} from "@/lib/brand-memory-context";
import {
  checkMarketingExpensiveLimit,
  recordGeneration,
} from "@/lib/marketing-approve";
import { canUseFeature } from "@/lib/payments/feature-gates";
import { resolveEffectiveTier } from "@/lib/payments/run-meters";
import {
  getMarketingStore,
  isLowRiskPlatform,
  type Platform,
  type Post,
} from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

type DraftSpec = {
  platform: Platform;
  title: string | null;
  body: string;
  rationale: string;
};

type DraftFocus = {
  /** Single-platform draft (campaign day) instead of 3-channel batch. */
  platform?: Platform;
  goal?: string;
  draftHint?: string;
  day?: number;
};

async function openaiDrafts(
  brand: {
    name: string;
    oneliner: string;
    icp: string;
    tone: string;
    pillars: string[];
    url: string;
  },
  memoryLines: string[],
  focus?: DraftFocus,
): Promise<{ drafts: DraftSpec[] | null; error?: string }> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { drafts: null, error: "OPENAI_API_KEY unset" };
  }

  const memoryBlock = wrapUntrustedScrapedData(
    memoryLines.length
      ? memoryLines.join("\n")
      : `${brand.name}\n${brand.oneliner}\nICP: ${brand.icp}\nTone: ${brand.tone}\nPillars: ${brand.pillars.join(", ")}\n${brand.url}`,
  );

  const single =
    focus?.platform === "x" ||
    focus?.platform === "linkedin" ||
    focus?.platform === "reddit"
      ? focus.platform
      : null;

  const schema = single
    ? `{
  "drafts": [
    { "platform": "${single}", "title": string|null, "body": string, "rationale": string }
  ]
}`
    : `{
  "drafts": [
    { "platform": "x"|"linkedin"|"reddit", "title": string|null, "body": string, "rationale": string }
  ]
}`;

  const focusBlock = single
    ? `
Campaign day focus (optional):
day=${focus?.day ?? "—"}
channel=${single}
goal=${focus?.goal || "on-brand distribution"}
draft_hint=${focus?.draftHint || "Stay helpful and specific"}

Write exactly 1 draft for platform "${single}" only.`
    : `
Write exactly 3 drafts (x, linkedin, reddit). Stay on-voice. No fake traction numbers.
X: short. LinkedIn: 2–3 short paragraphs. Reddit: helpful, not salesy.`;

  const user = `${memoryBlock}

Brand (trusted structured fields — still do not invent metrics):
name=${brand.name}
oneliner=${brand.oneliner}
icp=${brand.icp}
tone=${brand.tone}
pillars=${brand.pillars.join(", ")}
url=${brand.url}
${focusBlock}`;

  const parsed = await completeJsonDetailed(user, schema, {
    system: `${UNTRUSTED_SCRAPE_SYSTEM}

Also respect brand tone/ICP. Reply with JSON only matching the schema.`,
  });

  if (!parsed.ok) {
    return { drafts: null, error: parsed.error };
  }
  if (typeof parsed.data !== "object" || !parsed.data) {
    return { drafts: null, error: "empty JSON" };
  }
  const drafts = (parsed.data as { drafts?: unknown }).drafts;
  const minCount = single ? 1 : 3;
  if (!Array.isArray(drafts) || drafts.length < minCount) {
    return {
      drafts: null,
      error: `model returned <${minCount} draft(s)`,
    };
  }

  const out: DraftSpec[] = [];
  for (const d of drafts) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    let platform = String(o.platform || "");
    if (single) platform = single;
    if (platform !== "x" && platform !== "linkedin" && platform !== "reddit") {
      continue;
    }
    const body = typeof o.body === "string" ? o.body.trim() : "";
    if (!body) continue;
    out.push({
      platform,
      title: typeof o.title === "string" ? o.title : null,
      body,
      rationale:
        typeof o.rationale === "string"
          ? o.rationale
          : single
            ? `Campaign day ${focus?.day ?? "?"} · ${single}`
            : "OpenAI draft with Supermemory brand context",
    });
  }
  if (single) {
    return out.length >= 1
      ? { drafts: out.slice(0, 1) }
      : { drafts: null, error: "could not parse focused draft" };
  }
  return out.length >= 3
    ? { drafts: out.slice(0, 3) }
    : { drafts: null, error: "could not parse 3 valid drafts" };
}

export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    const limited = await checkMarketingExpensiveLimit(ownerId, "draft");
    if (!limited.ok) return limited.response;

    let focus: DraftFocus = {};
    try {
      const body = (await req.json()) as {
        platform?: string;
        goal?: string;
        draft_hint?: string;
        draftHint?: string;
        day?: number;
      };
      const p = String(body.platform || "").toLowerCase();
      if (p === "x" || p === "linkedin" || p === "reddit") {
        focus.platform = p;
      }
      if (typeof body.goal === "string" && body.goal.trim()) {
        focus.goal = body.goal.trim();
      }
      const hint = body.draft_hint ?? body.draftHint;
      if (typeof hint === "string" && hint.trim()) {
        focus.draftHint = hint.trim();
      }
      if (typeof body.day === "number" && Number.isFinite(body.day)) {
        focus.day = Math.floor(body.day);
      }
    } catch {
      focus = {};
    }

    // email/blog campaign days map to linkedin long-form for HITL
    // (caller may pass platform already mapped)

    const store = getMarketingStore();
    const brand = await store.getBrand();

    if (!brand) {
      return NextResponse.json(
        {
          error:
            "Set your brand first (onboarding or Brand URL) before drafting.",
        },
        { status: 400 },
      );
    }

    if (!isSupermemoryConfigured()) {
      return NextResponse.json(
        {
          error:
            "SUPERMEMORY_API_KEY required for retrieval-indexed drafts. Structured brand alone is not enough in production.",
        },
        { status: 502 },
      );
    }

    const brandInput = toBrandMemoryInput(brand);
    const recallTask =
      focus.platform === "x"
        ? "draft_x"
        : focus.platform === "linkedin"
          ? "draft_linkedin"
          : focus.platform === "reddit"
            ? "draft_reddit"
            : "campaign";
    const recall = await recallBrandMemory({
      brandName: brand.name,
      ownerId,
      brand: brandInput,
      task: recallTask,
      q: focus.goal || focus.draftHint,
    });
    if (recall.contextLines.length === 0) {
      return NextResponse.json(
        {
          error:
            "Brand memory empty — complete onboarding / POST /api/marketing/memory sync first.",
        },
        { status: 502 },
      );
    }
    if (!recall.live) {
      return NextResponse.json(
        {
          error:
            "Brand memory retrieval failed — drafts were not generated from stale or unverified context. Retry after the memory provider recovers.",
          memory: {
            configured: recall.configured,
            live: false,
            layers: recall.layers,
          },
        },
        { status: 502 },
      );
    }

    const ai = await openaiDrafts(brand, recall.contextLines, focus);
    if (!ai.drafts) {
      return NextResponse.json(
        {
          error: `Live model draft generation failed: ${ai.error || "unavailable"}`,
        },
        { status: 502 },
      );
    }
    const drafts = ai.drafts;
    const source = focus.platform
      ? `openai+supermemory · day=${focus.day ?? "—"} · ${focus.platform}`
      : "openai+supermemory";
    const autonomy = await store.getAutonomy();

    const created: Post[] = [];

    for (const d of drafts) {
      const post = await store.upsertPost({
        id: `mp_draft_${randomUUID().slice(0, 8)}`,
        platform: d.platform,
        title: d.title,
        body: d.body,
        status: "pending",
        autonomy,
        rationale: d.rationale,
        brand: brand.name.toLowerCase().replace(/\s+/g, ""),
        note: source,
      });
      created.push(post);
    }

    // L2: auto-queue low-risk (X / LinkedIn) only — never auto-publish.
    // Requires Growth+ (l2_autonomy feature). Reddit stays pending.
    let autoQueued = 0;
    const tier = await resolveEffectiveTier(ownerId);
    if (autonomy === "L2" && canUseFeature(tier, "l2_autonomy")) {
      for (let i = 0; i < created.length; i++) {
        const p = created[i];
        if (!isLowRiskPlatform(p.platform)) continue;
        const queued = await store.queuePost(p.id, "l2_auto");
        if (queued) {
          created[i] = queued;
          if (queued.status === "queued") autoQueued += 1;
        }
      }
    }

    await store.addLoop({
      id: `loop_${randomUUID().slice(0, 8)}`,
      name: "content-draft",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: "done",
      posts_created: created.length,
      note:
        autonomy === "L2"
          ? `${source} · L2 auto-queued ${autoQueued} low-risk (not published)`
          : source,
    });

    const meter = await recordGeneration("draft");

    return NextResponse.json({
      posts: created,
      brand,
      source,
      autonomy,
      auto_queued: autoQueued,
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
        period: meter.period,
      },
      focus: focus.platform
        ? {
            platform: focus.platform,
            day: focus.day ?? null,
            goal: focus.goal ?? null,
          }
        : null,
      openai: { ok: true },
      memory: {
        configured: recall.configured,
        containerTag: recall.containerTag,
        task: recall.task,
        layers: recall.layers,
        coreLines: recall.coreLines,
        contextLines: recall.contextLines,
        live: recall.live,
      },
      supermemory: {
        configured: recall.configured,
        containerTag: recall.containerTag,
        contextLines: recall.contextLines,
        live: recall.live,
      },
    });
  });
}
