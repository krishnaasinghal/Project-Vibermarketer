import { queryMemory } from "@vibe/engine";
import { NextResponse } from "next/server";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withOwnedStore(async () => {

    let q: string | undefined;
    try {
      const body = (await req.json()) as { q?: string };
      q = body.q;
    } catch {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }
    if (!q?.trim()) {
      return NextResponse.json({ error: "q required" }, { status: 400 });
    }
    const store = getStore();
    const data = await store.snapshot();
    const result = queryMemory(q, data.founders, data.products);
    return NextResponse.json({
      filters: result.filters,
      matched_terms: result.matched_terms,
      hits: result.hits.slice(0, 20).map((h) => ({
        founder: h.founder,
        product: h.products[0] ?? null,
        score: h.score,
        matched_terms: h.matched_terms,
        filter_hits: h.filter_hits,
      })),
    });
  });
}
