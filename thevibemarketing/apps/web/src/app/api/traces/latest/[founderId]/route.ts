import { NextResponse } from "next/server";
import { resolveFounder } from "@/lib/resolve-founder";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ founderId: string }> },
) {
  return withOwnedStore(async () => {

    const { founderId: raw } = await ctx.params;
    const store = getStore();
    const founder = await resolveFounder(store, raw);
    const founderId = founder?.id ?? raw;
    const run_id = await store.getLatestRunIdForFounder(founderId);
    if (!run_id) {
      return NextResponse.json({ run_id: null, traces: [] });
    }
    const traces = await store.getTraces(run_id);
    return NextResponse.json({ run_id, traces, founder_id: founderId });
  });
}
