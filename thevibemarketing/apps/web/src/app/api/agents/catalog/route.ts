import { AGENT_ENDPOINT_CATALOG } from "@vibe/engine";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Judge/ops: which API endpoints each key actually exercises. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    catalog: AGENT_ENDPOINT_CATALOG,
    note: "Lanes run on Screen (/api/screen/[id]) — traces step agent_lanes.",
  });
}
