import { getConnectLink, listConnectedAccounts } from "@vibe/engine";
import { NextResponse } from "next/server";
import { withOwnedStore } from "@/lib/with-store";

export const runtime = "nodejs";

/** List this user’s Composio connected accounts (post-OAuth status). */
export async function GET() {
  return withOwnedStore(async (user) => {
    try {
      const result = await listConnectedAccounts(user.id);
      return NextResponse.json(result, { status: result.status === "error" ? 503 : 200 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "list failed" },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: Request) {
  return withOwnedStore(async (user) => {
    try {
      const body = (await req.json()) as { toolkit?: string; userId?: string };
      const toolkit = body.toolkit?.trim();
      if (!toolkit) {
        return NextResponse.json({ error: "toolkit required" }, { status: 400 });
      }
      // Never trust browser-provided userId — use authenticated Supabase uid.
      const result = await getConnectLink(user.id, toolkit);
      return NextResponse.json(result, { status: result.status === "error" ? 503 : 200 });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "connect failed" },
        { status: 500 },
      );
    }
  });
}
