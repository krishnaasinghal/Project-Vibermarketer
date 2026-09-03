import { randomUUID } from "node:crypto";
import {
  buildContentRevisionKey,
  buildPublishIdempotencyKey,
  buildPublishRequestHash,
  calculateNextRetryAt,
  canTransitionOutboxJob,
  classifyPublishFailure,
  type PublishAttempt,
  type PublishOutboxJob,
} from "./publish-attempts";
import {
  PublishAttemptRepository,
} from "./publish-attempt-repo";
import {
  MarketingStoreError,
  type Platform,
  type Post,
  isPublishablePlatform,
  getMarketingStore,
} from "@/lib/marketing-store";
import { listConnectedAccounts, publishMarketingPost, type MarketingPublishResult } from "@vibe/engine";
import { currentOwnerId } from "@/lib/brand-memory-context";
import { runWithWorkspaceOwner } from "@/lib/workspace-context";

export type {
  PublishAttempt,
  PublishOutboxStatus,
  PublishAttemptStatus,
  PublishOutboxJob as PublishOutboxRecord,
} from "./publish-attempts";

export type PublishAttemptLikeRepository = {
  getPublishAttemptById(
    ownerId: string,
    attemptId: string,
  ): Promise<PublishAttempt | null>;
  getPublishAttemptByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<PublishAttempt | null>;
  getOutboxJobByAttempt(attemptId: string): Promise<PublishOutboxJob | null>;
  createOrReusePublishAttempt(input: {
    ownerId: string;
    postId: string;
    contentRevisionKey: string;
    provider: string;
    providerAccountId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ attempt: PublishAttempt; outboxJob: PublishOutboxJob }>;
  claimNextOutboxJob(
    leaseOwner: string,
    leaseMs?: number,
  ): Promise<PublishOutboxJob | null>;
  releaseExpiredLeases(): Promise<number>;
  markAttemptExecuting(attemptId: string): Promise<PublishAttempt>;
  markProviderSucceeded(
    attemptId: string,
    patch: {
      providerPostId: string;
      providerUrl?: string | null;
      providerResponse?: Record<string, unknown> | null;
    },
  ): Promise<PublishAttempt>;
  markOutcomeUnknown(
    attemptId: string,
    opts?: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishAttempt>;
  markRetryableFailure(
    attemptId: string,
    opts?: { errorCode?: string | null; message?: string | null; availableAt?: string | null },
  ): Promise<PublishAttempt>;
  markPermanentFailure(
    attemptId: string,
    opts?: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishAttempt>;
  markAttemptPublished(
    attemptId: string,
    providerPostId: string,
    providerUrl: string | null,
  ): Promise<PublishAttempt>;
  markAttemptCancelled(attemptId: string): Promise<PublishAttempt>;
  completeOutboxJob(jobId: string): Promise<PublishOutboxJob>;
  rescheduleOutboxJob(
    jobId: string,
    options?: { availableAt?: string; errorCode?: string | null; message?: string | null },
  ): Promise<PublishOutboxJob>;
  deadLetterOutboxJob(jobId: string, opts?: { errorCode?: string | null; message?: string | null }): Promise<PublishOutboxJob>;
  cancelOutboxJob(jobId: string): Promise<PublishOutboxJob>;
  listAttemptsForOwner(ownerId: string): Promise<
    Array<{ attempt: PublishAttempt; job: PublishOutboxJob | null }>
  >;
};

type PublishProvider = (params: {
  userId: string;
  platform: Platform;
  body: string;
  title?: string | null;
  connectedAccountId: string;
  subreddit?: string;
  flairId?: string;
}) => Promise<MarketingPublishResult>;

type ExecutionDeps = {
  repo?: PublishAttemptLikeRepository;
  publishMarketing?: PublishProvider;
  logger?: (event: string, fields: Record<string, unknown>) => void;
};

type ApproveBody = {
  subreddit?: string;
  flairId?: string;
  queueOnly?: boolean;
};

export type PublishActionResponse = {
  post: Post;
  publishAttempt?: PublishAttempt;
  publish: {
    status:
      | "queued"
      | "already_published"
      | "queued_only"
      | "queue_denied"
      | "rate_limited";
    providerPostId?: string | null;
    providerUrl?: string | null;
    error?: string;
    reason?: string;
  };
  queued: boolean;
  note: string;
};

export async function resolveActiveProviderAccountId(
  ownerId: string,
  platform: Platform,
): Promise<string | null> {
  const accounts = await listConnectedAccounts(ownerId);
  if (accounts.status !== "ok") return null;
  const toolkit =
    platform === "x"
      ? "twitter"
      : platform === "linkedin"
        ? "linkedin"
        : "reddit";
  const conn = accounts.byToolkit[platform] ?? accounts.byToolkit[toolkit];
  if (!conn || conn.status !== "ACTIVE") return null;
  return conn.accountId;
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

export function hashForPostAttempt(input: {
  ownerId: string;
  postId: string;
  platform: Platform;
  providerAccountId: string;
  post: Pick<Post, "title" | "body" | "rationale" | "media_url">;
}): {
  revisionKey: string;
  idempotencyKey: string;
  requestHash: string;
} {
  const revisionKey = buildContentRevisionKey({
    platform: input.platform,
    body: input.post.body,
    title: input.post.title ?? null,
    rationale: input.post.rationale,
    media_url: input.post.media_url ?? null,
  });
  const idempotencyKey = buildPublishIdempotencyKey({
    ownerId: input.ownerId,
    postId: input.postId,
    provider: input.platform,
    providerAccountId: input.providerAccountId,
    contentRevisionKey: revisionKey,
  });
  const requestHash = buildPublishRequestHash({
    post: {
      platform: input.platform,
      title: input.post.title ?? null,
      body: input.post.body,
      rationale: input.post.rationale,
      media_url: input.post.media_url ?? null,
    },
    provider: input.platform,
    providerAccountId: input.providerAccountId,
    contentRevisionKey: revisionKey,
  });
  return { revisionKey, idempotencyKey, requestHash };
}

export async function createPublishAttemptForPost(
  input: {
    ownerId: string;
    post: Post;
    connectedAccountId: string;
  },
  deps: ExecutionDeps = {},
): Promise<{ attempt: PublishAttempt; outboxJob: PublishOutboxJob; revisionKey: string }> {
  if (!isPublishablePlatform(input.post.platform)) {
    throw new MarketingStoreError(
      `Posting channel ${input.post.platform} is not supported for live publishing.`,
      "INVALID_TRANSITION",
      409,
    );
  }

  const repo = deps.repo ?? new PublishAttemptRepository();
  const { revisionKey, idempotencyKey, requestHash } = hashForPostAttempt({
    ownerId: input.ownerId,
    postId: input.post.id,
    platform: input.post.platform,
    providerAccountId: input.connectedAccountId,
    post: input.post,
  });
  const result = await repo.createOrReusePublishAttempt({
    ownerId: input.ownerId,
    postId: input.post.id,
    contentRevisionKey: revisionKey,
    provider: input.post.platform,
    providerAccountId: input.connectedAccountId,
    idempotencyKey,
    requestHash,
  });

  return { attempt: result.attempt, outboxJob: result.outboxJob, revisionKey };
}

export async function approveMarketingPost(
  id: string,
  body: ApproveBody = {},
  deps: ExecutionDeps = {},
): Promise<
  | { ok: true; result: PublishActionResponse }
  | { ok: false; status: number; error: string }
> {
  const store = getMarketingStore();
  const posts = await store.listPosts();
  const existing = posts.find((post) => post.id === id);
  if (!existing) {
    return { ok: false, status: 404, error: "post not found" };
  }

  if (existing.status === "published" && existing.provider_post_id) {
    return {
      ok: true,
      result: {
        post: existing,
        publish: {
          status: "already_published",
          providerPostId: existing.provider_post_id,
          providerUrl: existing.provider_url ?? null,
        },
        queued: false,
        note: "Already published with a provider post id.",
      },
    };
  }

  const ownerId = currentOwnerId();
  if (!ownerId || ownerId === "anonymous") {
    return {
      ok: false,
      status: 401,
      error: "Authentication required",
    };
  }

  const queued = await store.queuePost(id, "hitl_approve");
  if (!queued) {
    return { ok: false, status: 404, error: "post not found" };
  }

  if (!isPublishablePlatform(queued.platform)) {
    return {
      ok: true,
      result: {
        post: queued,
        publish: {
          status: "queue_denied",
          reason: "publish_not_supported",
          error:
            "This draft type is not connected to a live publishing connector yet.",
        },
        queued: true,
        note: "Queued for review only. Connect a supported channel (X, LinkedIn, Reddit) to publish.",
      },
    };
  }

  if (body.queueOnly === true) {
    return {
      ok: true,
      result: {
        post: queued,
        publish: { status: "queued_only", reason: "queueOnly" },
        queued: true,
        note: "Queued only. No provider execution requested.",
      },
    };
  }

  const connectedAccountId = await resolveActiveProviderAccountId(
    ownerId,
    queued.platform,
  );
  if (!connectedAccountId) {
    return {
      ok: true,
      result: {
        post: queued,
        publish: {
          status: "queue_denied",
          reason: "provider_not_connected",
          error: "No active connector available for this platform.",
        },
        queued: true,
        note: "Queued for provider execution. Connect this channel then retry approval.",
      },
    };
  }

  const repo = deps.repo ?? new PublishAttemptRepository();
  const { attempt } = await createPublishAttemptForPost(
    {
      ownerId,
      post: {
        ...queued,
        status: queued.status,
      },
      connectedAccountId,
    },
    { repo, publishMarketing: deps.publishMarketing, logger: deps.logger },
  );

  return {
    ok: true,
    result: {
      post: queued,
      publishAttempt: attempt,
      publish: {
        status:
          attempt.status === "published" || attempt.status === "provider_succeeded"
            ? "queued"
            : "queued",
      },
      queued: true,
      note: "Queued for provider execution.",
    },
  };
}

export function approveResultToResponse(
  outcome: Awaited<ReturnType<typeof approveMarketingPost>>,
): Response {
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json({
    post: outcome.result.post,
    draft: outcome.result.post,
    publishAttempt: outcome.result.publishAttempt,
    publish: outcome.result.publish,
    note: outcome.result.note,
  });
}

async function confirmAttemptInStore(
  attempt: PublishAttempt,
  post: Post,
  repo: PublishAttemptLikeRepository,
  ownerId: string,
): Promise<{ ok: true } | { ok: false; code: string; reason: string }> {
  try {
    const confirmedPost = await runWithWorkspaceOwner(ownerId, async () => {
      const store = getMarketingStore();
      return store.confirmPublished(post.id, {
        providerPostId: attempt.provider_post_id ?? "",
        providerUrl: attempt.provider_url ?? undefined,
        via: "hitl_approve",
        note: `Published by durable outbox attempt ${attempt.id}`,
      });
    });
    if (!confirmedPost) {
      return {
        ok: false,
        code: "POST_NOT_FOUND",
        reason: "Post missing while confirming provider publication.",
      };
    }
    if (confirmedPost.provider_post_id !== attempt.provider_post_id) {
      return {
        ok: false,
        code: "POST_PROVIDER_CONFLICT",
        reason: "Stored provider post id does not match the publish attempt.",
      };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof MarketingStoreError) {
      return {
        ok: false,
        code: error.code,
        reason: error.message,
      };
    }
    return {
      ok: false,
      code: "STORE_ERROR",
      reason: error instanceof Error ? error.message : "confirm failed",
    };
  }
}

function parseSubredditFromNote(note: string | null | undefined): string | undefined {
  if (!note) return undefined;
  const m = note.match(/subreddit\s*[:=]\s*([A-Za-z0-9_]+)/i);
  return m?.[1] ?? undefined;
}

function isValidProviderPostId(platform: Platform, value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  switch (platform) {
    case "x":
      return /^\d{10,}$/.test(candidate);
    case "linkedin": {
      if (candidate.startsWith("urn:li:")) {
        return /^urn:li:(share|ugcPost|activity):[A-Za-z0-9_-]+$/i.test(candidate);
      }
      return /^\d{10,}$/.test(candidate) || /^li-[a-z0-9-]+$/i.test(candidate);
    }
    case "reddit":
      if (candidate.startsWith("t3_")) {
        return /^t3_[A-Za-z0-9]+$/i.test(candidate);
      }
      return /^[A-Za-z0-9]{6,}$/i.test(candidate);
    default:
      return false;
  }
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

async function completeAttemptWithStore(
  attempt: PublishAttempt,
  job: PublishOutboxJob,
  repo: PublishAttemptLikeRepository,
): Promise<PublishAttempt> {
  const published = await repo.markAttemptPublished(
    attempt.id,
    attempt.provider_post_id ?? "",
    attempt.provider_url,
  );

  if (canTransitionOutboxJob(job.status, "completed")) {
    try {
      await repo.completeOutboxJob(job.id);
    } catch (error) {
      // If the job was already terminal, prefer publishing consistency.
      // This can happen under concurrent/manual recovery workflows.
      const code = errorCode(error);
      if (code !== "INVALID_OUTBOX_TRANSITION" && code !== "INVALID_TRANSITION") {
        throw error;
      }
    }
  }

  return published;
}

function ownerRequestKey(): string {
  return `publish_outbox:${randomUUID()}`;
}

export async function executePublishAttempt(
  attempt: PublishAttempt,
  outboxJob: PublishOutboxJob,
  deps: ExecutionDeps = {},
): Promise<{ ok: boolean; action: string; attempt: PublishAttempt }> {
  const repo = deps.repo ?? new PublishAttemptRepository();
  const publishMarketingFn = deps.publishMarketing ?? publishMarketingPost;
  const logger = deps.logger ?? logEvent;
  const ownerId = attempt.owner_id;

  logger("publish_execute_start", {
    request_id: ownerRequestKey(),
    attempt_id: attempt.id,
    job_id: outboxJob.id,
    owner_id: ownerId,
    post_id: attempt.post_id,
    provider: attempt.provider,
    attempt_status: attempt.status,
    job_status: outboxJob.status,
  });

  if (!ownerId) {
    throw new MarketingStoreError("Attempt owner missing", "UNAUTHORIZED", 401);
  }

  const post = await runWithWorkspaceOwner(ownerId, async () => {
    const store = getMarketingStore();
    const posts = await store.listPosts();
    return posts.find((p) => p.id === attempt.post_id) ?? null;
  });
  if (!post) {
    await repo.markPermanentFailure(attempt.id, {
      errorCode: "POST_NOT_FOUND",
      message: "Post missing while processing publish attempt.",
    });
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: "POST_NOT_FOUND",
      message: "Post missing while processing publish attempt.",
    });
    throw new MarketingStoreError("Post missing", "POST_NOT_FOUND", 404);
  }
  if (!isPublishablePlatform(post.platform)) {
    const permanentFailure = await repo.markPermanentFailure(attempt.id, {
      errorCode: "UNSUPPORTED_PLATFORM",
      message: `Attempt cannot execute. Channel ${post.platform} is not supported by publish worker.`,
    });
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: "UNSUPPORTED_PLATFORM",
      message: `Attempt cannot execute. Channel ${post.platform} is not supported by publish worker.`,
    });
    return { ok: false, action: "unsupported_platform", attempt: permanentFailure };
  }

  const providerAccountId = attempt.provider_account_id;
  const expectedHash = buildPublishRequestHash({
    post: {
      platform: post.platform,
      title: post.title ?? null,
      body: post.body,
      rationale: post.rationale,
      media_url: post.media_url ?? null,
    },
    provider: post.platform,
    providerAccountId,
    contentRevisionKey: buildContentRevisionKey({
      platform: post.platform,
      body: post.body,
      title: post.title ?? null,
      rationale: post.rationale,
      media_url: post.media_url ?? null,
    }),
  });
  if (attempt.request_hash !== expectedHash) {
    const locked = await repo.markPermanentFailure(attempt.id, {
      errorCode: "REQUEST_HASH_MISMATCH",
      message: "Post revision changed since attempt was created.",
    });
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: "REQUEST_HASH_MISMATCH",
      message: "Post revision changed since attempt was created.",
    });
    return {
      ok: false,
      action: "revision_mismatch",
      attempt: locked,
    };
  }

  if (attempt.status === "provider_succeeded") {
    const confirmed = await confirmAttemptInStore(attempt, post, repo, ownerId);
    if (confirmed.ok) {
      const completed = await completeAttemptWithStore(attempt, outboxJob, repo);
      return { ok: true, action: "confirm_publish", attempt: completed };
    }

    if (confirmed.code === "POST_PROVIDER_CONFLICT") {
      await repo.markPermanentFailure(attempt.id, {
        errorCode: confirmed.code,
        message: confirmed.reason,
      });
      await repo.deadLetterOutboxJob(outboxJob.id, {
        errorCode: confirmed.code,
        message: confirmed.reason,
      });
      return {
        ok: false,
        action: "provider_conflict",
        attempt: attempt,
      };
    }

    await repo.rescheduleOutboxJob(outboxJob.id, {
      availableAt: calculateNextRetryAt(attempt.attempt_count + 1),
      errorCode: confirmed.code,
      message: confirmed.reason,
    });
    return {
      ok: false,
      action: "confirm_retry",
      attempt,
    };
  }

  if (attempt.status === "outcome_unknown") {
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: "OUTCOME_UNKNOWN",
      message: "Cannot auto-republish unknown outcome.",
    });
    return { ok: false, action: "outcome_unknown", attempt };
  }

  if (attempt.status === "published") {
    if (outboxJob.status !== "completed") {
      await repo.completeOutboxJob(outboxJob.id);
    }
    return {
      ok: true,
      action: "already_published",
      attempt,
    };
  }

  if (
    attempt.status === "permanent_failure" ||
    attempt.status === "cancelled"
  ) {
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: `ATTEMPT_${attempt.status.toUpperCase()}`,
      message: `Attempt is ${attempt.status}, no retry.`,
    });
    return { ok: false, action: "blocked", attempt };
  }

  if (attempt.status === "executing") {
    const next = await repo.markOutcomeUnknown(attempt.id, {
      errorCode: "STALE_EXECUTION",
      message: "Execution was recovered after unknown lease state.",
    });
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: "STALE_EXECUTION",
      message: "Execution was recovered after stale lease. Reconcile required.",
    });
    return { ok: false, action: "stale_execution", attempt: next };
  }

  if (attempt.status !== "pending" && attempt.status !== "retryable_failure") {
    return {
      ok: false,
      action: `skip_status_${attempt.status}`,
      attempt,
    };
  }

  const executable = await repo.markAttemptExecuting(attempt.id);
  let result: MarketingPublishResult;
  try {
    result = await publishMarketingFn({
      userId: ownerId,
      platform: post.platform,
      body: post.body,
      title: post.title ?? null,
      connectedAccountId: executable.provider_account_id,
      subreddit: parseSubredditFromNote(post.note),
      flairId: undefined,
    });
  } catch (error) {
    result = {
      status: "error",
      platform: post.platform,
      message: error instanceof Error ? error.message : "Provider call failed",
    };
  }

  if (result.status === "error") {
    const failureKind = classifyPublishFailure(result.message);
    const reason =
      failureKind === "retryable"
        ? { code: "RETRYABLE_PROVIDER_ERROR", message: result.message }
        : failureKind === "permanent"
          ? { code: "PERMANENT_PROVIDER_ERROR", message: result.message }
          : { code: "OUTCOME_UNKNOWN", message: result.message };

    if (failureKind === "retryable") {
      const next = await repo.markRetryableFailure(executable.id, {
        errorCode: reason.code,
        message: reason.message,
        availableAt: calculateNextRetryAt(executable.attempt_count),
      });
      await repo.rescheduleOutboxJob(outboxJob.id, {
        availableAt: calculateNextRetryAt(executable.attempt_count),
        errorCode: reason.code,
        message: reason.message,
      });
      logger("publish_execute_retryable_failure", {
        request_id: ownerRequestKey(),
        attempt_id: executable.id,
        job_id: outboxJob.id,
        owner_id: ownerId,
        post_id: post.id,
        provider: post.platform,
        attempt_status: executable.status,
        job_status: "retryable_failure",
        error_code: reason.code,
      });
      return { ok: false, action: "retryable_failure", attempt: next };
    }

    if (failureKind === "permanent") {
      const next = await repo.markPermanentFailure(executable.id, {
        errorCode: reason.code,
        message: reason.message,
      });
      await repo.deadLetterOutboxJob(outboxJob.id, {
        errorCode: reason.code,
        message: reason.message,
      });
      return { ok: false, action: "permanent_failure", attempt: next };
    }

    const next = await repo.markOutcomeUnknown(executable.id, {
      errorCode: reason.code,
      message: reason.message,
    });
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: reason.code,
      message: reason.message,
    });
    return { ok: false, action: "outcome_unknown", attempt: next };
  }

  if (!isValidProviderPostId(post.platform, result.providerPostId)) {
    const next = await repo.markOutcomeUnknown(executable.id, {
      errorCode: "INVALID_PROVIDER_POST_ID",
      message:
        "Provider returned an invalid post identifier. Not marking as published.",
    });
    await repo.deadLetterOutboxJob(outboxJob.id, {
      errorCode: "INVALID_PROVIDER_POST_ID",
      message: "Provider returned an invalid post identifier.",
    });
      logger("publish_execute_invalid_provider_post_id", {
        request_id: ownerRequestKey(),
        attempt_id: executable.id,
        job_id: outboxJob.id,
        owner_id: ownerId,
        post_id: post.id,
        provider: post.platform,
        attempt_status: executable.status,
        job_status: "dead_letter",
        raw_provider_post_id: result.providerPostId,
      });
    return { ok: false, action: "invalid_provider_post_id", attempt: next };
  }

  const succeeded = await repo.markProviderSucceeded(executable.id, {
    providerPostId: result.providerPostId,
    providerUrl: result.providerUrl,
    providerResponse:
      result.raw && typeof result.raw === "object"
        ? (result.raw as Record<string, unknown>)
        : null,
  });

  const confirm = await confirmAttemptInStore(succeeded, post, repo, ownerId);
  if (confirm.ok) {
    const completed = await completeAttemptWithStore(succeeded, outboxJob, repo);
    return {
      ok: true,
      action: "published",
      attempt: completed,
    };
  }

  await repo.rescheduleOutboxJob(outboxJob.id, {
    availableAt: calculateNextRetryAt(succeeded.attempt_count + 1),
    errorCode: confirm.code,
    message: confirm.reason,
  });
  return {
    ok: false,
    action: "confirm_retry",
    attempt: succeeded,
  };
}

export async function executeNextPublishOutboxJob(
  options: { leaseOwner: string; leaseMs?: number; repo?: PublishAttemptLikeRepository } = {
    leaseOwner: `worker-${randomUUID()}`,
  },
): Promise<{ processed: boolean; action?: string; reason?: string }> {
  const repo = options.repo ?? new PublishAttemptRepository();
  await repo.releaseExpiredLeases();
  const job = await repo.claimNextOutboxJob(options.leaseOwner, options.leaseMs);
  if (!job) {
    return { processed: false, reason: "no_job" };
  }

  const attempt = await repo.getPublishAttemptById(job.owner_id, job.attempt_id);
  if (!attempt) {
    await repo.deadLetterOutboxJob(job.id, {
      errorCode: "ATTEMPT_MISSING",
      message: "Linked publish attempt was removed.",
    });
    return { processed: false, reason: "attempt_missing" };
  }

  const result = await executePublishAttempt(attempt, job, {
    repo,
  });
  return { processed: result.ok, action: result.action };
}

export async function executePublishOutboxBatch(options: {
  leaseOwner: string;
  batchSize?: number;
  leaseMs?: number;
  repo?: PublishAttemptLikeRepository;
}): Promise<{ processed: number; claimed: number; skipped: number; errors: number }> {
  const batch = Math.min(Math.max(options.batchSize ?? 1, 1), 100);
  const repo = options.repo ?? new PublishAttemptRepository();

  let processed = 0;
  let claimed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < batch; i++) {
    try {
      const result = await executeNextPublishOutboxJob({
        leaseOwner: options.leaseOwner,
        leaseMs: options.leaseMs,
        repo,
      });
      if (!result.processed) {
        if (result.reason === "no_job") break;
        skipped += 1;
        continue;
      }
      claimed += 1;
      processed += 1;
    } catch {
      errors += 1;
    }
  }

  return { processed, claimed, skipped, errors };
}

export async function reconcilePublishAttempt(
  ownerId: string,
  attemptId: string,
  action: "retry_confirm" | "retry_publish" | "cancel" | "mark_provider_succeeded",
  deps: ExecutionDeps = {},
): Promise<PublishAttempt> {
  const repo = deps.repo ?? new PublishAttemptRepository();
  const attempt = await repo.getPublishAttemptById(ownerId, attemptId);
  if (!attempt) {
    throw new MarketingStoreError("attempt not found", "POST_NOT_FOUND", 404);
  }
  const job = await repo.getOutboxJobByAttempt(attempt.id);
  if (!job) {
    throw new MarketingStoreError("outbox job not found", "POST_NOT_FOUND", 404);
  }

  if (action === "cancel") {
    await repo.cancelOutboxJob(job.id);
    return await repo.markAttemptCancelled(attempt.id);
  }

  if (action === "mark_provider_succeeded") {
    if (!attempt.provider_post_id) {
      throw new MarketingStoreError(
        "attempt has no provider post id",
        "POST_PROVIDER_ID_REQUIRED",
        400,
      );
    }
    if (!isValidProviderPostId(attempt.provider, attempt.provider_post_id)) {
      throw new MarketingStoreError(
        "attempt has invalid provider post id",
        "POST_PROVIDER_ID_INVALID",
        400,
      );
    }
    const updated = await repo.markProviderSucceeded(attempt.id, {
      providerPostId: attempt.provider_post_id,
      providerUrl: attempt.provider_url,
      providerResponse: attempt.provider_response,
    });
    await repo.rescheduleOutboxJob(job.id, {
      availableAt: new Date().toISOString(),
      message: "manual_mark_provider_succeeded",
    });
    return updated;
  }

  if (action === "retry_confirm") {
    if (attempt.provider_post_id) {
      if (!isValidProviderPostId(attempt.provider, attempt.provider_post_id)) {
        throw new MarketingStoreError(
          "attempt has invalid provider post id",
          "POST_PROVIDER_ID_INVALID",
          400,
        );
      }
      await repo.markProviderSucceeded(attempt.id, {
        providerPostId: attempt.provider_post_id,
        providerUrl: attempt.provider_url,
      });
    }
    await repo.rescheduleOutboxJob(job.id, {
      availableAt: new Date().toISOString(),
      message: "manual_confirm_retry",
    });
    return attempt;
  }

  if (action === "retry_publish") {
    if (attempt.outcome_unknown || attempt.status === "outcome_unknown") {
      throw new MarketingStoreError(
        "cannot retry publish when provider outcome is unknown",
        "OUTCOME_UNKNOWN",
        409,
      );
    }
    if (attempt.status !== "retryable_failure") {
      throw new MarketingStoreError(
        `attempt in status ${attempt.status} is not safe to republish`,
        "INVALID_TRANSITION",
        409,
      );
    }
    await repo.rescheduleOutboxJob(job.id, {
      availableAt: new Date().toISOString(),
      message: "manual_publish_retry",
    });
    return attempt;
  }

  throw new MarketingStoreError("Unsupported reconcile action", "INVALID_TRANSITION", 400);
}
