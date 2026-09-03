import { NextResponse } from "next/server";
import { withOwnedStore } from "@/lib/with-store";
import { runVcBrainPipeline } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
/** Each founder runs deep research — keep batch small on Vercel. */
export const maxDuration = 120;

/** Default cap for "Screen all" so the request finishes under platform limits. */
const DEFAULT_BATCH_CAP = 3;

/** POST /api/screen — batch screen founders (or body.ids). Capped for serverless. */
export async function POST(req: Request) {
  return withOwnedStore(async () => {

    const store = getStore();
    let ids: string[] | undefined;
    let cap = DEFAULT_BATCH_CAP;
    try {
      const body = (await req.json()) as { ids?: string[]; limit?: number };
      if (Array.isArray(body.ids) && body.ids.length) ids = body.ids;
      if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
        cap = Math.min(8, Math.max(1, Math.floor(body.limit)));
      }
    } catch {
      /* empty body ok */
    }

    const founders = await store.listFounders();
    // Prefer highest Founder Score first when screening a batch.
    const ranked = [...founders].sort(
      (a, b) => b.founder_score - a.founder_score,
    );
    const selected = ids
      ? ranked.filter((f) => ids!.includes(f.id))
      : ranked;
    const skipped = Math.max(0, selected.length - cap);
    const targets = selected.slice(0, cap);

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No founders to screen. Run Identify or inbound Apply first." },
        { status: 400 },
      );
    }

    const results: Array<{
      id: string;
      name: string;
      run_id: string;
      decision: string;
      decision_conf: number;
      founder_axis: number;
      market_axis: number;
      idea_axis: number;
      error?: string;
    }> = [];

    for (const f of targets) {
      try {
        const r = await runVcBrainPipeline(store, f.id);
        results.push({
          id: f.id,
          name: f.name,
          run_id: r.run_id,
          decision: r.memo.decision,
          decision_conf: r.memo.decision_conf,
          founder_axis: r.screening.founder_axis.score,
          market_axis: r.screening.market_axis.score,
          idea_axis: r.screening.idea_axis.score,
        });
      } catch (e) {
        results.push({
          id: f.id,
          name: f.name,
          run_id: "",
          decision: "error",
          decision_conf: 0,
          founder_axis: 0,
          market_axis: 0,
          idea_axis: 0,
          error: e instanceof Error ? e.message : "screen failed",
        });
      }
    }

    const failed = results.filter((r) => r.error).length;
    const ok = failed === 0;

    return NextResponse.json({
      ok,
      partial: failed > 0 && failed < results.length,
      count: results.length,
      failed,
      skipped,
      cap,
      note:
        skipped > 0
          ? `Screened top ${targets.length} by Founder Score (capped for serverless). ${skipped} left — open a founder and screen individually.`
          : undefined,
      results,
    });
  });
}
