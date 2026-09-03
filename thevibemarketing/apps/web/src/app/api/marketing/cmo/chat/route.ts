import {
  completeJsonDetailed,
  recallBrandMemory,
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
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lightweight CMO chat — brand memory grounded answers (not a full agent runtime).
 */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
    const limited = await checkMarketingExpensiveLimit(
      currentOwnerId(),
      "chat",
    );
    if (!limited.ok) return limited.response;

    const body = (await req.json()) as { message?: string };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const store = getMarketingStore();
    const brand = await store.getBrand();
    const posts = await store.listPosts();
    const pending = posts.filter((p) => p.status === "pending").length;

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json({
        reply: brand
          ? `I'm online for ${brand.name}, but OPENAI_API_KEY is unset. You have ${pending} drafts pending HITL. Open Studio to run Reddit/SEO/HN agents, or set the key for full CMO chat.`
          : "Onboard a brand first, then chat. OPENAI_API_KEY is also required for full answers.",
        offline: true,
      });
    }

    const recall = brand
      ? await recallBrandMemory({
          brandName: brand.name,
          ownerId: currentOwnerId(),
          brand: toBrandMemoryInput(brand),
          task: "general",
          q: message,
        })
      : null;

    const schema = `{ "reply": string, "suggested_actions": string[] }`;
    const user = `You are the vibemarketer AI CMO. Be concise, practical, founder-native.
Brand memory:
${recall?.contextLines.join("\n") || "(no brand yet — urge onboarding)"}
Queue: ${pending} pending drafts.
User: ${message}

Reply as their CMO. suggested_actions are short UI steps (e.g. "Run Reddit agent", "Open HITL queue").`;

    const parsed = await completeJsonDetailed(user, schema, {
      system:
        "You are a sharp AI CMO for SaaS founders. No fake metrics. HITL is non-negotiable for publish.",
    });

    if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") {
      return NextResponse.json({
        reply:
          "I hit a model error. Try Studio agents (Reddit / SEO / HN) or rephrase.",
        offline: false,
        error: parsed.ok ? "bad json" : parsed.error,
      });
    }

    const o = parsed.data as { reply?: string; suggested_actions?: string[] };
    const meter = await recordGeneration("chat");
    return NextResponse.json({
      reply:
        typeof o.reply === "string"
          ? o.reply
          : "Let's grow — try running an agent from the feed.",
      suggested_actions: Array.isArray(o.suggested_actions)
        ? o.suggested_actions.filter((x) => typeof x === "string").slice(0, 5)
        : [],
      offline: false,
      meter: {
        used: meter.used,
        limit: meter.limit,
        remaining: meter.remaining,
      },
    });
  });
}
