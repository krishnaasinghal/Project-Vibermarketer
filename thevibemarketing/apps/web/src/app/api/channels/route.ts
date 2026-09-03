import { channelIntelligence } from "@vibe/engine";
import { NextResponse } from "next/server";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** GET /api/channels — sourcing channel stats + underexplored tips. */
export async function GET() {
  return withOwnedStore(async () => {

    const store = getStore();
    const snap = await store.snapshot();
    const intel = channelIntelligence(snap);
    return NextResponse.json(intel);
  });
}
