import { NextResponse } from "next/server";
import { currentOwnerId } from "@/lib/brand-memory-context";
import { PublishAttemptRepository } from "@/lib/publishing/publish-attempt-repo";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";

function parseBoolean(value: string | null): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function GET(req: Request) {
  return withMarketingStore(async () => {
    const ownerId = currentOwnerId();
    if (!ownerId || ownerId === "anonymous") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status")?.trim();
    const includeCompleted = parseBoolean(searchParams.get("includeCompleted"));

    const repo = new PublishAttemptRepository();
    const list = await repo.listAttemptsForOwner(ownerId);
    const items = list.filter(({ attempt }) => {
      if (!includeCompleted && attempt.status === "published") return false;
      if (statusFilter) {
        return attempt.status === statusFilter;
      }
      return true;
    });

    return NextResponse.json({ attempts: items });
  });
}
