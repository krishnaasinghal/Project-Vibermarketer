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
import { assertFeature } from "@/lib/payments/feature-gates";
import {
  getMarketingStore,
  type CampaignBrief,
  type CampaignDay,
  type Platform,
} from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    return NextResponse.json({ campaign: await store.getCampaign() });
  });
}

/**
 * Live 7-day campaign brief from brand memory + model.
 * No static templates. Drafts still require Studio generate / agents + HITL.
 */
export async function POST() {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    const gated = await assertFeature(ownerId, "campaign");
    if (!gated.ok) return gated.response;

    const limited = await checkMarketingExpensiveLimit(ownerId, "campaign");
    if (!limited.ok) return limited.response;

    const store = getMarketingStore();
    const brand = await store.getBrand();
    if (!brand) {
      return NextResponse.json(
        { error: "Set brand first (onboarding) before campaign planning." },
        { status: 400 },
      );
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY required for live campaign generation." },
        { status: 502 },
      );
    }
    if (!isSupermemoryConfigured()) {
      return NextResponse.json(
        {
          error:
            "SUPERMEMORY_API_KEY required so the campaign uses retrieval-indexed brand memory.",
        },
        { status: 502 },
      );
    }

    const recall = await recallBrandMemory({
      brandName: brand.name,
      ownerId,
      brand: toBrandMemoryInput(brand),
      task: "campaign",
    });
    if (recall.contextLines.length === 0) {
      return NextResponse.json(
        {
          error:
            "Brand memory empty — complete onboarding / memory sync first.",
        },
        { status: 502 },
      );
    }

    const memoryBlock = wrapUntrustedScrapedData(recall.contextLines.join("\n"));
    const schema = `{
  "title": string,
  "audience": string,
  "days": [
    {
      "day": number,
      "channel": "x"|"linkedin"|"reddit"|"email"|"blog",
      "goal": string,
      "draft_hint": string
    }
  ],
  "note": string
}`;

    const user = `${memoryBlock}

Brand (structured):
name=${brand.name}
oneliner=${brand.oneliner}
icp=${brand.icp}
tone=${brand.tone}
pillars=${brand.pillars.join(", ")}
url=${brand.url}

Plan a practical 7-day founder marketing campaign for this product.
Exactly 7 days (day 1..7). Mix founder channels (x, linkedin, reddit) and at most one blog or email.
No fake metrics. draft_hint should be actionable for a later HITL draft.
Keep goals concrete and short.`;

    const parsed = await completeJsonDetailed(user, schema, {
      system: `${UNTRUSTED_SCRAPE_SYSTEM}

You are a practical CMO for indie SaaS. JSON only matching the schema.`,
    });

    if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") {
      return NextResponse.json(
        {
          error: `Live campaign generation failed: ${parsed.ok ? "invalid model output" : parsed.error}`,
        },
        { status: 502 },
      );
    }

    const raw = parsed.data as {
      title?: unknown;
      audience?: unknown;
      days?: unknown;
      note?: unknown;
    };

    const title =
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : `7-day plan for ${brand.name}`;
    const audience =
      typeof raw.audience === "string" && raw.audience.trim()
        ? raw.audience.trim()
        : brand.icp;
    const note =
      typeof raw.note === "string" && raw.note.trim()
        ? raw.note.trim()
        : "Live model brief — generate drafts in Studio; all posts still go through HITL.";

    const allowedChannels = new Set([
      "x",
      "linkedin",
      "reddit",
      "email",
      "blog",
    ]);
    const daysIn: CampaignDay[] = [];
    if (Array.isArray(raw.days)) {
      for (const d of raw.days) {
        if (!d || typeof d !== "object") continue;
        const o = d as Record<string, unknown>;
        const dayNum = Number(o.day);
        const channel = String(o.channel || "").toLowerCase();
        const goal = typeof o.goal === "string" ? o.goal.trim() : "";
        const draft_hint =
          typeof o.draft_hint === "string" ? o.draft_hint.trim() : "";
        if (
          !Number.isFinite(dayNum) ||
          dayNum < 1 ||
          dayNum > 14 ||
          !allowedChannels.has(channel) ||
          !goal
        ) {
          continue;
        }
        daysIn.push({
          day: Math.floor(dayNum),
          channel: channel as Platform | "email" | "blog",
          goal,
          draft_hint: draft_hint || goal,
        });
      }
    }

    // Normalize to 7 days if model under/over-delivers
    daysIn.sort((a, b) => a.day - b.day);
    let days = daysIn.slice(0, 7);
    while (days.length < 7) {
      const n = days.length + 1;
      const rotate: Array<Platform | "email" | "blog"> = [
        "x",
        "linkedin",
        "reddit",
        "x",
        "blog",
        "linkedin",
        "reddit",
      ];
      days.push({
        day: n,
        channel: rotate[n - 1] ?? "x",
        goal: `Day ${n}: stay on-voice for ${brand.name}`,
        draft_hint: `One ${rotate[n - 1] ?? "x"} post grounded in brand pillars.`,
      });
    }
    days = days.map((d, i) => ({ ...d, day: i + 1 }));

    const campaign: CampaignBrief = {
      id: `camp_${randomUUID().slice(0, 8)}`,
      title,
      created_at: new Date().toISOString(),
      audience,
      days,
      note: `${note} · source=openai+supermemory · drafts still HITL`,
    };

    const saved = await store.setCampaign(campaign);
    const meter = await recordGeneration("campaign");
    return NextResponse.json({
      campaign: saved,
      source: "openai+supermemory",
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
      },
      memory: {
        containerTag: recall.containerTag,
        contextLines: recall.contextLines.length,
      },
    });
  });
}
