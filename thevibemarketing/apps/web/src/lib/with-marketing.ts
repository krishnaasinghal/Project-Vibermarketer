import { NextResponse } from "next/server";
import { MarketingStoreError } from "@/lib/marketing-store";
import { withOwnedStore } from "@/lib/with-store";

/** Auth + owner-scoped marketing store for fleet APIs. */
export async function withMarketingStore(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await withOwnedStore(async () => handler());
  } catch (e) {
    if (e instanceof MarketingStoreError) {
      console.error(`[marketing] ${e.code}:`, e.message);
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      );
    }
    console.error("[marketing]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Marketing API failed" },
      { status: 500 },
    );
  }
}
