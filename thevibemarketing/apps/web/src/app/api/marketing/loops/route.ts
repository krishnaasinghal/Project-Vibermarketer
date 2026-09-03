import { NextResponse } from "next/server";
import { getMarketingStore } from "@/lib/marketing-store";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const loops = await store.listLoops();
    return NextResponse.json({ loops });
  });
}
