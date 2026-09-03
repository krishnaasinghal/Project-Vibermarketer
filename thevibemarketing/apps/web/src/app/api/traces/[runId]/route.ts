import { NextResponse } from "next/server";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  return withOwnedStore(async () => {

    const { runId } = await ctx.params;
    const store = getStore();
    const traces = await store.getTraces(runId);
    return NextResponse.json({ steps: traces, traces });
  });
}
