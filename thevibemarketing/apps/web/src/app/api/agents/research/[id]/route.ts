import { NextResponse } from "next/server";
import { runDeepResearch, startRun } from "@vibe/engine";
import { resolveFounder } from "@/lib/resolve-founder";
import { getStore } from "@/lib/store";
import { withOwnedStore } from "@/lib/with-store";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Standalone deep diligence — multi-search (Tavily + Firecrawl + optional E2B)
 * → cite-bound synthesis → ResearchDossier. Prefer full screen for $100K memo.
 */
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
    const founderId = founder.id;
    const product = await store.getProductForFounder(founderId);
    const signals = await store.getSignalsFor(founderId);
    const { run_id } = startRun("deep_research");

    try {
      const dossier = await runDeepResearch({
        founder,
        product,
        signals,
        run_id,
        store,
        budgetMs: Number(process.env.DEEP_RESEARCH_TIMEOUT_MS) || 55_000,
        maxScrapes: Number(process.env.DEEP_RESEARCH_MAX_SCRAPES) || 3,
      });

      if (dossier.synthesis !== "openai") {
        return NextResponse.json(
          {
            ok: false,
            run_id,
            error: dossier.open_questions[0] ?? "Live research synthesis is unavailable.",
            provider_status: dossier.provider_status,
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        ok: true,
        run_id,
        dossier: {
          ...dossier,
          // Keep payload light for UI — full excerpts stay in traces/Memory
          raw_hits: dossier.raw_hits.slice(0, 12).map((h) => ({
            provider: h.provider,
            query: h.query,
            url: h.url,
            title: h.title,
            excerpt: h.excerpt.slice(0, 200),
          })),
        },
        next: "Run 3-axis screen (or Open $100K memo) to fold research into the decision",
      });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          run_id,
          error: e instanceof Error ? e.message : "Deep research failed",
        },
        { status: 500 },
      );
    }
  });
}
