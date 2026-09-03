import { NextResponse } from "next/server";
import { resolveFounder } from "@/lib/resolve-founder";
import { withOwnedStore } from "@/lib/with-store";
import {
  openaiChatHealth,
  polishMemoSections,
  type MemoSection,
} from "@vibe/engine";
import { runVcBrainPipeline } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

async function maybePolishSections(
  sections: MemoSection[],
): Promise<{ sections: MemoSection[]; polished: boolean; reason?: string }> {
  if (process.env.OPENAI_SKIP_POLISH === "1") {
    return { sections, polished: false, reason: "OPENAI_SKIP_POLISH=1" };
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { sections, polished: false, reason: "no key" };
  }

  const health = await openaiChatHealth();
  if (!health.ok) {
    return {
      sections,
      polished: false,
      reason: `chat unavailable (${health.detail})`,
    };
  }

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const polished = await Promise.race([
      polishMemoSections(sections, {
        apiKey: process.env.OPENAI_API_KEY,
      }),
      new Promise<MemoSection[]>((resolve) => {
        timer = setTimeout(() => resolve(sections), 2500);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    const changed = polished.some(
      (s, i) => s.body !== sections[i]?.body,
    );
    return {
      sections: polished,
      polished: changed,
      reason: changed ? "openai" : "unchanged-or-timeout",
    };
  } catch {
    return { sections, polished: false, reason: "polish error" };
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withOwnedStore(async () => {

    const { id } = await ctx.params;
    const store = getStore();
    const founder = await resolveFounder(store, id);
    if (!founder) {
      return NextResponse.json({ error: "Founder not found" }, { status: 404 });
    }
    try {
      const result = await runVcBrainPipeline(store, founder.id);

      // Optional language polish only — never blocks demo on quota/latency.
      const polish = await maybePolishSections(result.memo.sections);
      if (polish.polished) {
        const memo = { ...result.memo, sections: polish.sections };
        await store.saveMemo(memo);
        return NextResponse.json({
          ...result,
          memo,
          polish: { ok: true, reason: polish.reason },
        });
      }

      return NextResponse.json({
        ...result,
        polish: { ok: false, reason: polish.reason },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "memo failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withOwnedStore(async () => {

    const { id } = await ctx.params;
    const store = getStore();
    const founder = await resolveFounder(store, id);
    const memo = await store.getLatestMemo(founder?.id ?? id);
    if (!memo) return NextResponse.json({ error: "no memo" }, { status: 404 });
    return NextResponse.json({ memo, founder_id: founder?.id ?? id });
  });
}
