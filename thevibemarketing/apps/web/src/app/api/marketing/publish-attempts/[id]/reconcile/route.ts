import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/brand-memory-context";
import { reconcilePublishAttempt } from "@/lib/publishing/publish-attempt-service";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

type Body = {
  action?: "retry_confirm" | "retry_publish" | "cancel" | "mark_provider_succeeded";
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    if (!ownerId || ownerId === "anonymous") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: attemptId } = await ctx.params;
    if (!attemptId) {
      return NextResponse.json({ error: "attempt id required" }, { status: 400 });
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const action = body.action?.trim();
    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 },
      );
    }

    if (
      action !== "retry_confirm" &&
      action !== "retry_publish" &&
      action !== "cancel" &&
      action !== "mark_provider_succeeded"
    ) {
      return NextResponse.json({ error: "unsupported action" }, { status: 400 });
    }

    const attempt = await reconcilePublishAttempt(
      ownerId,
      attemptId,
      action,
      {},
    );
    return NextResponse.json({ attempt });
  });
}
