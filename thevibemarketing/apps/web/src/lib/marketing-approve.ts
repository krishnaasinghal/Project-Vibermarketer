/**
 * Shared HITL approve flow.
 * In this production path, approval only queues publishing through the durable
 * publish-attempt/outbox pipeline. It never performs provider writes directly.
 */

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { currentOwnerId } from "@/lib/brand-memory-context";
import {
  approveMarketingPost as enqueuePublishAttempt,
  approveResultToResponse as outboxApproveResponse,
  type PublishActionResponse,
} from "./publishing/publish-attempt-service";
import {
  checkMarketingExpensiveLimit as checkRunMeter,
  recordGeneration,
  type GenerationKind,
} from "./payments/run-meters";

export { recordGeneration };
export type { GenerationKind };

export type ApproveBody = {
  subreddit?: string;
  flairId?: string;
  /** Skip provider execution now; queue only. */
  queueOnly?: boolean;
};

export type ApproveResult = PublishActionResponse;

/**
 * Approve a marketing post for the current workspace owner.
 * Returns a structured result; caller wraps as JSON.
 */
export async function approveMarketingPost(
  id: string,
  body: ApproveBody = {},
): Promise<
  | { ok: true; result: ApproveResult }
  | { ok: false; status: number; error: string }
> {
  const ownerId = currentOwnerId();
  if (!ownerId || ownerId === "anonymous") {
    return {
      ok: false,
      status: 401,
      error: "Authentication required",
    };
  }

  // Keep request admission control lightweight and fail-closed.
  const publishLimit = checkRateLimit(`marketing-publish:${ownerId}`, 20, 60_000);
  if (!publishLimit.ok) {
    return {
      ok: false,
      status: 429,
      error: `Too many approve/publish attempts. Retry in ${publishLimit.retryAfterSec}s.`,
    };
  }

  const outcome = await enqueuePublishAttempt(id, {
    subreddit: body.subreddit,
    flairId: body.flairId,
    queueOnly: body.queueOnly,
  });
  if (!outcome.ok) {
    return outcome;
  }

  const publishStatus = outcome.result.publish.status;
  if (publishStatus === "already_published") {
    // Replays on already-confirmed posts.
    return {
      ok: true,
      result: outcome.result,
    };
  }

  if (publishStatus === "queued" && !outcome.result.publishAttempt) {
    // Defensive fallback if durable queueing is disabled for a platform.
    return {
      ok: false,
      status: 503,
      error: "Failed to create durable publish attempt.",
    };
  }

  // Preserve existing response shape for queue UIs.
  return {
    ok: true,
    result: outcome.result,
  };
}

export function approveResultToResponse(
  outcome: Awaited<ReturnType<typeof approveMarketingPost>>,
) {
  return outboxApproveResponse(outcome);
}

export async function checkMarketingExpensiveLimit(
  ownerId: string,
  kind: GenerationKind = "other",
) {
  return checkRunMeter(ownerId, kind);
}
