import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/brand-memory-context";
import {
  getMarketingStore,
  type AutonomyLevel,
} from "@/lib/marketing-store";
import { assertFeature } from "@/lib/payments/feature-gates";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

const LEVELS = new Set<AutonomyLevel>(["L1", "L2", "L3"]);

const NOTES: Record<AutonomyLevel, string> = {
  L1: "All drafts pending HITL. Approve queues for publish (connected account needed for live).",
  L2: "X/LinkedIn multi-channel drafts auto-queue (not publish). Reddit/SEO/HN stay pending HITL. Requires Growth+.",
  L3: "Coming soon — L3 auto-publish is blocked until a dedicated live provider path is enabled.",
};

export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const autonomy = await store.getAutonomy();
    return NextResponse.json({
      autonomy,
      note: NOTES[autonomy],
    });
  });
}

export async function POST(req: Request) {
  return withMarketingStore(async () => {
    let body: { autonomy?: string };
    try {
      body = (await req.json()) as { autonomy?: string };
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (!body.autonomy || !LEVELS.has(body.autonomy as AutonomyLevel)) {
      return NextResponse.json(
        { error: 'autonomy must be "L1", "L2", or "L3"' },
        { status: 400 },
      );
    }

    const level = body.autonomy as AutonomyLevel;

    // L2 is a Growth+ feature; L3 remains product-blocked even on Pro
    if (level === "L2") {
      const gated = await assertFeature(currentOwnerId(), "l2_autonomy");
      if (!gated.ok) return gated.response;
    }
    if (level === "L3") {
      return NextResponse.json(
        {
          error:
            "L3 auto-publish is not available yet. Stay on L1 or L2 (Growth+).",
          code: "L3_BLOCKED",
        },
        { status: 403 },
      );
    }

    const store = getMarketingStore();
    const autonomy = await store.setAutonomy(level);
    return NextResponse.json({
      autonomy,
      note: NOTES[autonomy],
    });
  });
}
