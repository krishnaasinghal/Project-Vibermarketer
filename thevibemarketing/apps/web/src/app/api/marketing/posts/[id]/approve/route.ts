import {
  approveMarketingPost,
  approveResultToResponse,
} from "@/lib/marketing-approve";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * HITL approve:
 * 1) queue the post in marketing_state
 * 2) if Composio has an ACTIVE connection for the platform, attempt live publish
 * 3) only mark `published` when the provider returns a post id
 *
 * Never pretends publish succeeded.
 */
export async function POST(req: Request, { params }: Params) {
  return withMarketingStore(async () => {
    const { id } = await params;
    let body: { subreddit?: string; flairId?: string; queueOnly?: boolean } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }

    const outcome = await approveMarketingPost(id, body);
    return approveResultToResponse(outcome);
  });
}
