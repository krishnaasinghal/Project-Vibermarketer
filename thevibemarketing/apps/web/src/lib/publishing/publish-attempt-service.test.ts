import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import {
  canTransitionOutboxJob,
  canTransitionPublishAttempt,
  buildContentRevisionKey,
  buildPublishRequestHash,
  type PublishAttempt,
  type PublishAttemptStatus,
  type PublishOutboxJob,
  type PublishOutboxJobType,
  type PublishOutboxStatus,
} from "./publish-attempts";
import {
  createPublishAttemptForPost,
  executePublishAttempt,
  executePublishOutboxBatch,
  reconcilePublishAttempt,
} from "./publish-attempt-service";
import { POST as drainRoutePost } from "@/app/api/internal/publishing/drain/route";
import type { PublishAttemptLikeRepository } from "./publish-attempt-service";
import { MarketingStoreError, getMarketingStore } from "../marketing-store";
import { runWithWorkspaceOwner } from "../workspace-context";
import type { MarketingPublishResult } from "@vibe/engine";
import { writableDataPath } from "../paths";
import type { Platform, Post } from "../marketing-store";

process.env.MARKETING_STORE_BACKEND = "local";

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 10)}`;
}

function toMs(value: string): number {
  return new Date(value).getTime();
}

function ownerPath(ownerId: string): string {
  const safe = ownerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return writableDataPath("marketing", `${safe}.json`);
}

function buildPostRevisionSignature(post: {
  platform: Platform;
  title: string | null | undefined;
  body: string;
  rationale: string;
  media_url?: string | null;
}): {
  revisionKey: string;
  requestHash: string;
} {
  const revisionKey = buildContentRevisionKey({
    platform: post.platform,
    body: post.body,
    title: post.title ?? null,
    rationale: post.rationale,
    media_url: post.media_url ?? null,
  });
  const requestHash = buildPublishRequestHash({
    post: {
      platform: post.platform,
      title: post.title ?? null,
      body: post.body,
      rationale: post.rationale,
      media_url: post.media_url ?? null,
    },
    provider: post.platform,
    providerAccountId: "acct-1",
    contentRevisionKey: revisionKey,
  });

  return { revisionKey, requestHash };
}

class InMemoryPublishAttemptRepository implements PublishAttemptLikeRepository {
  attempts = new Map<string, PublishAttempt>();
  outbox = new Map<string, PublishOutboxJob>();
  idempotency = new Map<string, string>();
  private inFlight = new Map<string, Promise<{ attempt: PublishAttempt; outboxJob: PublishOutboxJob }>>();

  async getPublishAttemptById(ownerId: string, attemptId: string): Promise<PublishAttempt | null> {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return null;
    return attempt.owner_id === ownerId ? attempt : null;
  }

  async getPublishAttemptByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<PublishAttempt | null> {
    const attemptId = this.idempotency.get(`${ownerId}:${idempotencyKey}`);
    if (!attemptId) return null;
    return this.getPublishAttemptById(ownerId, attemptId);
  }

  async getOutboxJobByAttempt(attemptId: string): Promise<PublishOutboxJob | null> {
    return this.outbox.get(attemptId) ?? null;
  }

  async createOutboxJobIfMissing(
    ownerId: string,
    attemptId: string,
    jobType: PublishOutboxJobType = "publish",
  ): Promise<PublishOutboxJob> {
    const existing = this.outbox.get(attemptId);
    if (existing) return existing;

    const job: PublishOutboxJob = {
      id: nextId("job"),
      owner_id: ownerId,
      attempt_id: attemptId,
      job_type: jobType,
      status: "pending",
      available_at: nowIso(),
      lease_owner: null,
      lease_expires_at: null,
      attempt_count: 0,
      last_error_code: null,
      last_error_message: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      completed_at: null,
    };

    this.outbox.set(attemptId, job);
    return job;
  }

  async createOrReusePublishAttempt(opts: {
    ownerId: string;
    postId: string;
    contentRevisionKey: string;
    provider: string;
    providerAccountId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ attempt: PublishAttempt; outboxJob: PublishOutboxJob }> {
    const key = `${opts.ownerId}:${opts.idempotencyKey}`;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const op = (async () => {
      const existingId = this.idempotency.get(key);
      const existingAttempt = existingId ? this.attempts.get(existingId) : null;
      if (existingAttempt) {
        const outboxJob = await this.createOutboxJobIfMissing(opts.ownerId, existingAttempt.id);
        return { attempt: existingAttempt, outboxJob };
      }

      const attempt: PublishAttempt = {
        id: nextId("att"),
        owner_id: opts.ownerId,
        post_id: opts.postId,
        content_revision_key: opts.contentRevisionKey,
        provider: opts.provider as PublishAttempt["provider"],
        provider_account_id: opts.providerAccountId,
        idempotency_key: opts.idempotencyKey,
        request_hash: opts.requestHash,
        status: "pending",
        provider_post_id: null,
        provider_url: null,
        provider_response: null,
        attempt_count: 0,
        last_error_code: null,
        last_error_message: null,
        outcome_unknown: false,
        next_retry_at: null,
        started_at: null,
        completed_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      this.attempts.set(attempt.id, attempt);
      this.idempotency.set(key, attempt.id);

      const outboxJob = await this.createOutboxJobIfMissing(opts.ownerId, attempt.id);
      return { attempt, outboxJob };
    })();

    this.inFlight.set(key, op);
    try {
      return await op;
    } finally {
      this.inFlight.delete(key);
    }
  }

  async claimNextOutboxJob(leaseOwner: string, leaseMs = 30_000): Promise<PublishOutboxJob | null> {
    const now = nowIso();
    const nextLeaseUntil = new Date(Date.now() + Math.max(leaseMs, 5_000)).toISOString();

    const candidate = [...this.outbox.values()]
      .filter((job) => {
        if (job.status !== "pending" && job.status !== "retryable_failure") return false;
        if (job.available_at > now) return false;
        if (job.lease_expires_at && job.lease_expires_at > now) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.available_at === b.available_at) {
          return a.created_at.localeCompare(b.created_at);
        }
        return a.available_at.localeCompare(b.available_at);
      })[0] ?? null;

    if (!candidate) return null;

    const leased: PublishOutboxJob = {
      ...candidate,
      status: "leased",
      lease_owner: leaseOwner,
      lease_expires_at: nextLeaseUntil,
      attempt_count: candidate.attempt_count + 1,
      updated_at: nowIso(),
      last_error_code: null,
      last_error_message: null,
    };
    this.outbox.set(candidate.attempt_id, leased);
    return leased;
  }

  async releaseExpiredLeases(): Promise<number> {
    const now = nowIso();
    let count = 0;
    for (const [attemptId, job] of this.outbox) {
      if (job.status === "leased" && job.lease_expires_at && job.lease_expires_at <= now) {
        this.outbox.set(attemptId, {
          ...job,
          status: "pending",
          lease_owner: null,
          lease_expires_at: null,
          updated_at: nowIso(),
        });
        count += 1;
      }
    }

    return count;
  }

  async markAttemptExecuting(attemptId: string): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "executing", {
      started_at: nowIso(),
      attempt_count: (this.attempts.get(attemptId)?.attempt_count ?? 0) + 1,
      last_error_code: null,
      last_error_message: null,
    });
  }

  async markAttemptCancelled(attemptId: string): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "cancelled", {
      last_error_code: "CANCELLED",
      last_error_message: "Cancelled by operator.",
    });
  }

  async markAttemptPublished(
    attemptId: string,
    providerPostId: string,
    providerUrl: string | null,
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "published", {
      provider_post_id: providerPostId,
      provider_url: providerUrl,
      completed_at: nowIso(),
      outcome_unknown: false,
      last_error_code: null,
      last_error_message: null,
    });
  }

  async markProviderSucceeded(
    attemptId: string,
    patch: {
      providerPostId: string;
      providerUrl?: string | null;
      providerResponse?: Record<string, unknown> | null;
    },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "provider_succeeded", {
      provider_post_id: patch.providerPostId,
      provider_url: patch.providerUrl ?? null,
      provider_response: patch.providerResponse ?? null,
      outcome_unknown: false,
      last_error_code: null,
      last_error_message: null,
    });
  }

  async markOutcomeUnknown(
    attemptId: string,
    opts?: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "outcome_unknown", {
      last_error_code: opts?.errorCode ?? "OUTCOME_UNKNOWN",
      last_error_message: opts?.message ?? "Provider outcome unknown",
      outcome_unknown: true,
      next_retry_at: null,
    });
  }

  async markRetryableFailure(
    attemptId: string,
    opts?: { errorCode?: string | null; message?: string | null; availableAt?: string | null },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "retryable_failure", {
      last_error_code: opts?.errorCode ?? "RETRYABLE_FAILURE",
      last_error_message: opts?.message ?? "Provider call failure",
      outcome_unknown: false,
      next_retry_at: opts?.availableAt ?? null,
    });
  }

  async markPermanentFailure(
    attemptId: string,
    opts?: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "permanent_failure", {
      last_error_code: opts?.errorCode ?? "PERMANENT_FAILURE",
      last_error_message: opts?.message ?? "Provider call failed",
      outcome_unknown: false,
      next_retry_at: null,
    });
  }

  async completeOutboxJob(jobId: string): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "completed", {
      lease_owner: null,
      lease_expires_at: null,
      completed_at: nowIso(),
    });
  }

  async rescheduleOutboxJob(
    jobId: string,
    options?: { availableAt?: string; errorCode?: string | null; message?: string | null },
  ): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "retryable_failure", {
      available_at: options?.availableAt ?? nowIso(),
      lease_owner: null,
      lease_expires_at: null,
      last_error_code: options?.errorCode ?? null,
      last_error_message: options?.message ?? null,
    });
  }

  async deadLetterOutboxJob(
    jobId: string,
    opts?: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "dead_letter", {
      lease_owner: null,
      lease_expires_at: null,
      last_error_code: opts?.errorCode ?? null,
      last_error_message: opts?.message ?? null,
    });
  }

  async cancelOutboxJob(jobId: string): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "cancelled", {
      lease_owner: null,
      lease_expires_at: null,
    });
  }

  async listAttemptsForOwner(ownerId: string): Promise<
    Array<{ attempt: PublishAttempt; job: PublishOutboxJob | null }>
  > {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.owner_id === ownerId)
      .map((attempt) => ({
        attempt,
        job: this.outbox.get(attempt.id) ?? null,
      }));
  }

  setOutboxForAttempt(attemptId: string, patch: Partial<PublishOutboxJob>): void {
    const current = this.outbox.get(attemptId);
    if (!current) return;
    this.outbox.set(attemptId, {
      ...current,
      ...patch,
      updated_at: nowIso(),
    });
  }

  private updateAttemptStatus(
    attemptId: string,
    nextStatus: PublishAttemptStatus,
    patch: Partial<PublishAttempt>,
  ): PublishAttempt {
    const current = this.attempts.get(attemptId);
    if (!current) {
      throw new Error(`attempt ${attemptId} not found`);
    }

    if (!canTransitionPublishAttempt(current.status, nextStatus)) {
      throw new Error(`invalid attempt transition ${current.status} -> ${nextStatus}`);
    }

    const nextAttempt = {
      ...current,
      ...patch,
      status: nextStatus,
      updated_at: nowIso(),
    };
    this.attempts.set(attemptId, nextAttempt);
    return nextAttempt;
  }

  private updateOutboxStatus(
    jobId: string,
    nextStatus: PublishOutboxStatus,
    patch: Partial<PublishOutboxJob>,
  ): PublishOutboxJob {
    const current = [...this.outbox.values()].find((job) => job.id === jobId);
    if (!current) {
      throw new Error(`outbox ${jobId} not found`);
    }

    if (!canTransitionOutboxJob(current.status, nextStatus)) {
      throw new Error(`invalid outbox transition ${current.status} -> ${nextStatus}`);
    }

    const next = {
      ...current,
      ...patch,
      status: nextStatus,
      updated_at: nowIso(),
    };
    this.outbox.set(current.attempt_id, next);
    return next;
  }
}

class OrderCheckingPublishAttemptRepository extends InMemoryPublishAttemptRepository {
  readonly callOrder: string[] = [];

  override async markAttemptPublished(
    attemptId: string,
    providerPostId: string,
    providerUrl: string | null,
  ): Promise<PublishAttempt> {
    this.callOrder.push("markAttemptPublished");
    return super.markAttemptPublished(attemptId, providerPostId, providerUrl);
  }

  override async completeOutboxJob(jobId: string): Promise<PublishOutboxJob> {
    const job = [...this.outbox.values()].find(
      (entry) => entry.id === jobId,
    );
    if (!job) {
      throw new Error(`outbox ${jobId} missing`);
    }
    const currentAttempt = this.attempts.get(job.attempt_id);
    if (!currentAttempt) {
      throw new Error(`attempt ${job.attempt_id} missing for job ${jobId}`);
    }
    if (currentAttempt.status !== "published") {
      throw new Error("outbox completion happened before attempt publish");
    }

    this.callOrder.push("completeOutboxJob");
    return super.completeOutboxJob(jobId);
  }
}

async function seedPost(ownerId: string, body: string, platform: Post["platform"] = "x"): Promise<Post> {
  return runWithWorkspaceOwner(ownerId, async () => {
    const store = getMarketingStore();
    return store.upsertPost({
      platform,
      title: "Draft",
      body,
      rationale: "seed",
      autonomy: "L1",
    });
  });
}

async function queuePostForOwner(ownerId: string, postId: string): Promise<Post> {
  return runWithWorkspaceOwner(ownerId, async () => {
    const store = getMarketingStore();
    const queued = await store.queuePost(postId, "hitl_approve");
    if (!queued) {
      throw new Error(`post ${postId} not found for queueing`);
    }
    return queued;
  });
}

async function clearOwner(ownerId: string): Promise<void> {
  const path = ownerPath(ownerId);
  await rm(path, { force: true });
}

(async function run() {
  const owners: string[] = [];
  const callLog: string[] = [];

  try {
    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const repo = new InMemoryPublishAttemptRepository();
      const postPayload = {
        id: `post-${randomUUID().slice(0, 8)}`,
        status: "pending" as const,
        platform: "x" as const,
        title: "Draft",
        body: "One stable draft body",
        rationale: "seed",
        autonomy: "L1" as const,
        brand: "default",
        created_at: nowIso(),
      };
      const { requestHash } = buildPostRevisionSignature(postPayload);

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          createPublishAttemptForPost(
            {
              ownerId,
              post: postPayload as Post,
              connectedAccountId: "acct-1",
            },
            { repo },
          ),
        ),
      );

      const attemptIds = new Set(results.map((entry) => entry.attempt.id));
      const jobIds = new Set(results.map((entry) => entry.outboxJob.id));
      assert.equal(attemptIds.size, 1, "20 concurrent calls reuse one attempt");
      assert.equal(jobIds.size, 1, "one outbox job per logical attempt");

      const finalAttempt = results[0].attempt;
      assert.equal(finalAttempt.request_hash, requestHash);
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Rewind draft body");
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      // Corrupt hash after creation to force request-hash mismatch path.
      const mismatchedAttempt = {
        ...created.attempt,
        request_hash: `${created.attempt.request_hash}:bad`,
      };
      repo.attempts.set(mismatchedAttempt.id, mismatchedAttempt);

      let calls = 0;
      const outcome = await executePublishAttempt(mismatchedAttempt, created.outboxJob, {
        repo,
        publishMarketing: async () => {
          calls += 1;
          return {
            status: "ok",
            platform: post.platform,
            providerPostId: "provider-id",
            providerUrl: "https://x.com/status/1",
          } as MarketingPublishResult;
        },
      });

      assert.equal(outcome.action, "revision_mismatch");
      assert.equal(calls, 0, "revision mismatch does not call provider");
      const final = (await repo.getPublishAttemptById(ownerId, created.attempt.id))!;
      assert.equal(final.status, "permanent_failure");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Timeout test draft");
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      let calls = 0;
      const providerError: () => Promise<MarketingPublishResult> = async () => {
        calls += 1;
        return {
          status: "error",
          platform: post.platform,
          message: "request timed out while waiting for provider response",
        } as MarketingPublishResult;
      };

      const first = await executePublishAttempt(created.attempt, created.outboxJob, {
        repo,
        publishMarketing: providerError,
      });
      assert.equal(first.action, "outcome_unknown");
      assert.equal(calls, 1);

      const once = (await repo.getPublishAttemptById(ownerId, created.attempt.id))!;
      assert.equal(once.status, "outcome_unknown");

      const outboxAfter = (await repo.getOutboxJobByAttempt(created.attempt.id))!;
      const second = await executePublishAttempt(once, outboxAfter, {
        repo,
        publishMarketing: providerError,
      });
      assert.equal(second.action, "outcome_unknown");
      assert.equal(calls, 1, "unknown outcomes are not auto-republished");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "One-time publish draft");
      await queuePostForOwner(ownerId, post.id);
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      let calls = 0;
      const providerSuccess = async () => {
        calls += 1;
        callLog.push(`call:${calls}`);
        return {
          status: "ok",
          platform: post.platform,
          providerPostId: "12345678901",
          providerUrl: "https://x.com/status/12345678901",
          raw: { provider_post_id: "abc" },
        } as MarketingPublishResult;
      };

      const first = await executePublishAttempt(created.attempt, created.outboxJob, {
        repo,
        publishMarketing: providerSuccess,
      });
      assert.equal(first.action, "published");

      const published = (await repo.getPublishAttemptById(ownerId, created.attempt.id))!;
      assert.equal(published.status, "published");
      assert.equal(published.provider_post_id, "12345678901");
      assert.equal(calls, 1);

      const finalOutbox = (await repo.getOutboxJobByAttempt(created.attempt.id))!;
      const second = await executePublishAttempt(published, finalOutbox, {
        repo,
        publishMarketing: providerSuccess,
      });
      assert.equal(second.action, "already_published");
      assert.equal(calls, 1, "publish action is idempotent at attempt level");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Malformed provider id draft");
      await queuePostForOwner(ownerId, post.id);
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      const result = await executePublishAttempt(created.attempt, created.outboxJob, {
        repo,
        publishMarketing: async () =>
          ({
            status: "ok",
            platform: post.platform,
            providerPostId: "short-id",
            providerUrl: "https://x.com/status/short-id",
          }) as MarketingPublishResult,
      });
      assert.equal(result.action, "invalid_provider_post_id");

      const attempt = (await repo.getPublishAttemptById(ownerId, created.attempt.id))!;
      assert.equal(attempt.status, "outcome_unknown");
      assert.equal(attempt.provider_post_id, null);

      const outbox = (await repo.getOutboxJobByAttempt(created.attempt.id))!;
      assert.equal(outbox.status, "dead_letter");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Publish completion order draft");
      await queuePostForOwner(ownerId, post.id);
      const repo = new OrderCheckingPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      const result = await executePublishAttempt(created.attempt, created.outboxJob, {
        repo,
        publishMarketing: async () => ({
          status: "ok",
          platform: post.platform,
          providerPostId: "12345678902",
          providerUrl: "https://x.com/status/12345678902",
        } as MarketingPublishResult),
      });

      assert.equal(result.action, "published");
      assert.equal(
        repo.callOrder[0],
        "markAttemptPublished",
        "attempt publication should happen before job completion",
      );
      assert.equal(
        repo.callOrder[1],
        "completeOutboxJob",
        "outbox completion should happen after attempt publication",
      );
      assert.equal(repo.callOrder.length, 2);
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Provider succeeded branch");
      await queuePostForOwner(ownerId, post.id);
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      const providerSucceeded = await repo.markProviderSucceeded(created.attempt.id, {
        providerPostId: "12345678903",
        providerUrl: "https://x.com/status/12345678903",
      });
      const outbox = (await repo.getOutboxJobByAttempt(created.attempt.id))!;

      let calls = 0;
      const result = await executePublishAttempt(providerSucceeded, outbox, {
        repo,
        publishMarketing: async () => {
          calls += 1;
          return {
            status: "ok",
            platform: post.platform,
            providerPostId: "12345678903",
            providerUrl: "https://x.com/status/12345678903",
          } as MarketingPublishResult;
        },
      });

      assert.equal(calls, 0, "provider_succeeded attempts do not call provider again");
      assert.equal(result.action, "confirm_publish");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Retryable failure draft");
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      let calls = 0;
      const result = await executePublishAttempt(created.attempt, created.outboxJob, {
        repo,
        publishMarketing: async () => {
          calls += 1;
          return {
            status: "error",
            platform: post.platform,
            message: "connection reset by peer",
          } as MarketingPublishResult;
        },
      });
      assert.equal(result.action, "retryable_failure");
      const attempt = (await repo.getPublishAttemptById(ownerId, created.attempt.id))!;
      const updated = (await repo.getOutboxJobByAttempt(created.attempt.id))!;
      assert.equal(attempt.status, "retryable_failure");
      assert.equal(updated.status, "retryable_failure");
      assert.ok(toMs(updated.available_at) >= Date.now());
      assert.equal(calls, 1);
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Permanent failure draft");
      const repo = new InMemoryPublishAttemptRepository();
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      const result = await executePublishAttempt(created.attempt, created.outboxJob, {
        repo,
        publishMarketing: async () =>
          ({
            status: "error",
            platform: post.platform,
            message: "account is suspended or permissions revoked",
          }) as MarketingPublishResult,
      });
      assert.equal(result.action, "permanent_failure");
      const updatedAttempt = await repo.getPublishAttemptById(ownerId, created.attempt.id);
      const updatedJob = await repo.getOutboxJobByAttempt(created.attempt.id);
      assert.equal(updatedAttempt?.status, "permanent_failure");
      assert.equal(updatedJob?.status, "dead_letter");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const post = await seedPost(ownerId, "Lease test draft");
      const repo = new InMemoryPublishAttemptRepository();
      const { attempt } = await createPublishAttemptForPost(
        {
          ownerId,
          post: {
            ...post,
            status: "pending",
            created_at: nowIso(),
          } as Post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      const first = await repo.claimNextOutboxJob("worker-a", 30_000);
      assert.equal(first?.lease_owner, "worker-a");
      const second = await repo.claimNextOutboxJob("worker-b", 30_000);
      assert.equal(second, null, "active lease blocks second claim");

      const leased = (await repo.getOutboxJobByAttempt(attempt.id))!;
      repo.setOutboxForAttempt(attempt.id, {
        lease_owner: leased.lease_owner,
        lease_expires_at: new Date(Date.now() - 20_000).toISOString(),
        status: "leased",
      });
      const released = await repo.releaseExpiredLeases();
      assert.equal(released, 1);

      const reclaimed = await repo.claimNextOutboxJob("worker-b", 30_000);
      assert.equal(reclaimed?.lease_owner, "worker-b");
    }

    {
      const ownerA = `owner-${randomBytes(5).toString("hex")}`;
      const ownerB = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerA, ownerB);
      const repo = new InMemoryPublishAttemptRepository();

      const post = await seedPost(ownerA, "Tenant boundary draft");
      const result = await createPublishAttemptForPost(
        {
          ownerId: ownerA,
          post,
          connectedAccountId: "acct-a",
        },
        { repo },
      );

      const visibleToOwnerA = await repo.listAttemptsForOwner(ownerA);
      const visibleToOwnerB = await repo.listAttemptsForOwner(ownerB);
      assert.equal(visibleToOwnerA.length, 1);
      assert.equal(visibleToOwnerB.length, 0);
      const byIdempotency = await repo.getPublishAttemptByIdempotencyKey(
        ownerA,
        result.attempt.idempotency_key,
      );
      assert.equal(byIdempotency?.id, result.attempt.id);
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const repo = new InMemoryPublishAttemptRepository();
      const post = await seedPost(ownerId, "Batch-limit draft");
      await queuePostForOwner(ownerId, post.id);
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );
      await repo.markProviderSucceeded(created.attempt.id, {
        providerPostId: "12345678904",
        providerUrl: "https://x.com/status/12345678904",
      });
      const batch = await executePublishOutboxBatch({
        leaseOwner: "batch-worker",
        leaseMs: 30_000,
        batchSize: 1,
        repo,
      });
      assert.equal(batch.processed, 1);
      assert.equal(batch.claimed, 1);
      assert.equal(batch.skipped, 0);
      assert.equal(batch.errors, 0);
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const repo = new InMemoryPublishAttemptRepository();
      const post = await seedPost(ownerId, "Reconcile branch draft");
      await queuePostForOwner(ownerId, post.id);
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      await repo.markProviderSucceeded(created.attempt.id, {
        providerPostId: "12345678905",
        providerUrl: "https://x.com/status/12345678905",
      });
      const reconciled = await reconcilePublishAttempt(ownerId, created.attempt.id, "retry_confirm", {
        repo,
      });
      assert.equal(reconciled.provider_post_id, "12345678905");
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const repo = new InMemoryPublishAttemptRepository();
      const post = await seedPost(ownerId, "Unknown provider outcome draft");
      await queuePostForOwner(ownerId, post.id);
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      await repo.markOutcomeUnknown(created.attempt.id);

      let thrown: MarketingStoreError | null = null;
      try {
        await reconcilePublishAttempt(ownerId, created.attempt.id, "retry_publish", {
          repo,
        });
      } catch (error) {
        thrown = error as MarketingStoreError;
      }
      const outcomeUnknownCode: MarketingStoreError["code"] = "OUTCOME_UNKNOWN";
      assert.equal(thrown?.code, outcomeUnknownCode);
      assert.equal(thrown?.status, 409);
    }

    {
      const ownerId = `owner-${randomBytes(5).toString("hex")}`;
      owners.push(ownerId);
      const repo = new InMemoryPublishAttemptRepository();
      const post = await seedPost(ownerId, "Reconcile invalid provider id draft");
      await queuePostForOwner(ownerId, post.id);
      const created = await createPublishAttemptForPost(
        {
          ownerId,
          post,
          connectedAccountId: "acct-1",
        },
        { repo },
      );

      await repo.markProviderSucceeded(created.attempt.id, {
        providerPostId: "bad-id",
        providerUrl: "https://x.com/status/bad-id",
      });

      let thrown: MarketingStoreError | null = null;
      try {
        await reconcilePublishAttempt(ownerId, created.attempt.id, "mark_provider_succeeded", {
          repo,
        });
      } catch (error) {
        thrown = error as MarketingStoreError;
      }
      assert.equal(thrown?.code, "POST_PROVIDER_ID_INVALID");
    }

    {
      const previous = process.env.INTERNAL_WORKER_SECRET;

      if (previous !== undefined) {
        delete process.env.INTERNAL_WORKER_SECRET;
      }

      const missing = await drainRoutePost(
        new Request("https://example.test/api/internal/publishing/drain", {
          method: "POST",
          body: JSON.stringify({ batchSize: 1 }),
        }),
      );
      const missingPayload = (await missing.json()) as { error?: string };
      assert.equal(missing.status, 401);
      assert.equal(missingPayload.error, "INTERNAL_WORKER_SECRET is not configured");

      process.env.INTERNAL_WORKER_SECRET = "drain-secret";

      const wrong = await drainRoutePost(
        new Request("https://example.test/api/internal/publishing/drain", {
          method: "POST",
          headers: { "x-internal-secret": "wrong" },
          body: JSON.stringify({ batchSize: 1 }),
        }),
      );
      const wrongPayload = (await wrong.json()) as { error?: string };
      assert.equal(wrong.status, 401);
      assert.equal(wrongPayload.error, "Invalid internal worker secret");

      const wrongLength = await drainRoutePost(
        new Request("https://example.test/api/internal/publishing/drain", {
          method: "POST",
          headers: { "x-internal-secret": "drain-secret-extra" },
          body: JSON.stringify({ batchSize: 1 }),
        }),
      );
      const wrongLengthPayload = (await wrongLength.json()) as { error?: string };
      assert.equal(wrongLength.status, 401);
      assert.equal(wrongLengthPayload.error, "Invalid internal worker secret");

      const byQuery = await drainRoutePost(
        new Request(
          "https://example.test/api/internal/publishing/drain?secret=drain-secret",
          {
            method: "POST",
            body: JSON.stringify({ batchSize: 1, leaseOwner: "cron-worker" }),
          },
        ),
      );
      const byQueryPayload = (await byQuery.json()) as { error?: string };
      assert.equal(byQuery.status, 401);
      assert.equal(byQueryPayload.error, "Invalid internal worker secret");

      const ok = await drainRoutePost(
        new Request("https://example.test/api/internal/publishing/drain", {
          method: "POST",
          headers: { "x-internal-secret": "drain-secret" },
          body: JSON.stringify({ batchSize: 1, leaseOwner: "test-worker" }),
        }),
      );
      const okPayload = (await ok.json()) as {
        processed: number;
        claimed: number;
        skipped: number;
        errors: number;
      };
      assert.equal(ok.status, 200);
      assert.equal(typeof okPayload.processed, "number");
      assert.equal(typeof okPayload.claimed, "number");
      assert.equal(typeof okPayload.skipped, "number");
      assert.equal(typeof okPayload.errors, "number");

      if (previous === undefined) {
        delete process.env.INTERNAL_WORKER_SECRET;
      } else {
        process.env.INTERNAL_WORKER_SECRET = previous;
      }
    }
  } finally {
    for (const ownerId of owners) {
      await clearOwner(ownerId);
    }
  }

  assert.equal(callLog.length >= 1, true, "provider invocation was observed");
  console.log("publish-attempt-service.test: ok");
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
