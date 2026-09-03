import {
  MARKETING_AGENT_CATALOG,
  marketingAgentSummary,
} from "@vibe/engine";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Public-ish catalog of the marketing agent fleet (AI CMO wall).
 * Used by product UI; statuses are honest (live / partial / next / soon / later).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    product: "vibemarketer",
    thesis: "Cursor for marketing — agent fleet with brand memory and HITL.",
    category_floor:
      "Named channel + content agents (parity with AI CMO products like Okara); differentiation is memory, HITL truth, and provider-true publish.",
    summary: marketingAgentSummary(),
    agents: MARKETING_AGENT_CATALOG,
  });
}
