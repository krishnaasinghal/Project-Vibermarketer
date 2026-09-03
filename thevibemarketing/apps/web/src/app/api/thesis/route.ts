import { normalizeThesis, type Thesis } from "@vibe/engine";
import { NextResponse } from "next/server";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return withOwnedStore(async () => {

    const store = getStore();
    const thesis = await store.getThesis();
    return NextResponse.json({ thesis });
  });
}

export async function PUT(req: Request) {
  return withOwnedStore(async () => {

    try {
      const body = (await req.json()) as Record<string, unknown>;
      const store = getStore();
      const existing = await store.getThesis();
      const thesis: Thesis = normalizeThesis({
        sectors: body.sectors ?? existing?.sectors,
        stage: body.stage ?? existing?.stage,
        geo: body.geo ?? existing?.geo,
        check_size: body.check_size ?? existing?.check_size,
        ownership_target:
          body.ownership_target ?? existing?.ownership_target ?? 0.1,
        risk: body.risk ?? existing?.risk,
      });
      await store.setThesis(thesis);
      return NextResponse.json({ thesis });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "invalid thesis" },
        { status: 400 },
      );
    }
  });
}
