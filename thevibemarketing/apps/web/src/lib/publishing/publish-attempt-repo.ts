import { MarketingStoreError } from "@/lib/marketing-store";
import { getSupabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  PublishAttempt,
  PublishAttemptStatus,
  PublishOutboxJob,
  PublishOutboxJobType,
  PublishOutboxStatus,
} from "./publish-attempts";
import {
  PUBLISH_ATTEMPT_STATUSES,
  PUBLISH_OUTBOX_STATUSES,
  assertPublishAttemptTransition,
  assertPublishOutboxTransition,
} from "./publish-attempts";

export type { PublishAttempt as PublishAttemptRecord };

type RpcAttemptRow = {
  attempt: Record<string, unknown>;
  outbox_job: Record<string, unknown>;
};

type DbAttemptRow = {
  id: string;
  owner_id: string;
  post_id: string;
  content_revision_key: string;
  provider: string;
  provider_account_id: string;
  idempotency_key: string;
  request_hash: string;
  status: string;
  provider_post_id?: string | null;
  provider_url?: string | null;
  provider_response?: Record<string, unknown> | null;
  attempt_count?: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  outcome_unknown?: boolean;
  next_retry_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type DbOutboxRow = {
  id: string;
  owner_id: string;
  attempt_id: string;
  job_type: string;
  status: string;
  available_at: string;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  attempt_count?: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

function ensureAdmin() {
  const sb = getSupabaseAdmin();
  if (!hasSupabaseAdmin() || !sb) {
    throw new MarketingStoreError("Supabase admin client unavailable", "UNAVAILABLE", 503);
  }
  return sb;
}

function assertStatus<T extends string>(value: string, allowed: readonly string[], label: string): T {
  if (!allowed.includes(value)) {
    throw new MarketingStoreError(`Unexpected ${label} ${value}`, "INVALID_TRANSITION", 409);
  }
  return value as T;
}

function parseAttempt(row: DbAttemptRow): PublishAttempt {
  return {
    id: String(row.id ?? ""),
    owner_id: String(row.owner_id ?? ""),
    post_id: String(row.post_id ?? ""),
    content_revision_key: String(row.content_revision_key ?? ""),
    provider: String(row.provider ?? "") as PublishAttempt["provider"],
    provider_account_id: String(row.provider_account_id ?? ""),
    idempotency_key: String(row.idempotency_key ?? ""),
    request_hash: String(row.request_hash ?? ""),
    status: assertStatus<PublishAttemptStatus>(
      String(row.status ?? "pending"),
      PUBLISH_ATTEMPT_STATUSES,
      "attempt status",
    ),
    provider_post_id: (row.provider_post_id ?? null) as string | null,
    provider_url: (row.provider_url ?? null) as string | null,
    provider_response: parseProviderResponse(row.provider_response),
    attempt_count: Number.isFinite(Number(row.attempt_count))
      ? Math.max(0, Math.floor(Number(row.attempt_count)))
      : 0,
    last_error_code: (row.last_error_code ?? null) as string | null,
    last_error_message: (row.last_error_message ?? null) as string | null,
    outcome_unknown: Boolean(row.outcome_unknown),
    next_retry_at: (row.next_retry_at ?? null) as string | null,
    started_at: (row.started_at ?? null) as string | null,
    completed_at: (row.completed_at ?? null) as string | null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function parseOutbox(row: DbOutboxRow): PublishOutboxJob {
  return {
    id: String(row.id ?? ""),
    owner_id: String(row.owner_id ?? ""),
    attempt_id: String(row.attempt_id ?? ""),
    job_type: assertStatus<PublishOutboxJobType>(
      String(row.job_type ?? "publish"),
      ["publish", "confirm_publish"],
      "job type",
    ),
    status: assertStatus<PublishOutboxStatus>(
      String(row.status ?? "pending"),
      PUBLISH_OUTBOX_STATUSES,
      "outbox status",
    ),
    available_at: String(row.available_at ?? new Date().toISOString()),
    lease_owner: (row.lease_owner ?? null) as string | null,
    lease_expires_at: (row.lease_expires_at ?? null) as string | null,
    attempt_count: Number.isFinite(Number(row.attempt_count))
      ? Math.max(0, Math.floor(Number(row.attempt_count)))
      : 0,
    last_error_code: (row.last_error_code ?? null) as string | null,
    last_error_message: (row.last_error_message ?? null) as string | null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    completed_at: (row.completed_at ?? null) as string | null,
  };
}

function parseProviderResponse(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function firstRow<T>(data: T[] | null): T | null {
  return (data ?? [])[0] ?? null;
}

async function executeQuery<T>(
  query:
    | Promise<{ data: T[] | null; error: { message?: string } | null }>
    | { data: T[] | null; error: { message?: string } | null }
    | unknown,
): Promise<T[]> {
  const resolved = await Promise.resolve(query);
  const { data, error } = resolved as {
    data: T[] | null;
    error: { message?: string } | null;
  };
  if (error) {
    throw new MarketingStoreError(
      `marketing publish query failed: ${error.message ?? "database error"}`,
      "UNAVAILABLE",
      503,
    );
  }
  return data ?? [];
}

function requireOwner(ownerId: string): string {
  if (!ownerId) {
    throw new MarketingStoreError("ownerId is required", "UNAUTHORIZED", 401);
  }
  return ownerId;
}

async function selectSingle<T>(
  query:
    | Promise<{ data: T | null; error: { message?: string } | null }>
    | { data: T | null; error: { message?: string } | null }
    | unknown,
): Promise<T | null> {
  const resolved =
    query instanceof Promise ? await query : await Promise.resolve(query);
  const { data, error } = resolved as { data: T | null; error: { message?: string } | null };
  if (error) {
    throw new MarketingStoreError(
      `marketing publish query failed: ${error.message ?? "database error"}`,
      "UNAVAILABLE",
      503,
    );
  }
  return data ?? null;
}

export class PublishAttemptRepository {
  async getPublishAttemptById(ownerId: string, attemptId: string): Promise<PublishAttempt | null> {
    const owner = requireOwner(ownerId);
    if (!attemptId) return null;

    const sb = ensureAdmin();
      const row = await selectSingle<DbAttemptRow>(
        sb
          .from("marketing_publish_attempts")
          .select("*")
          .eq("owner_id", owner)
          .eq("id", attemptId)
          .maybeSingle() as unknown,
      );

    return row ? parseAttempt(row) : null;
  }

  async getPublishAttemptByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<PublishAttempt | null> {
    const owner = requireOwner(ownerId);
    if (!idempotencyKey) return null;

    const sb = ensureAdmin();
    const row = await selectSingle<DbAttemptRow>(
      sb
        .from("marketing_publish_attempts")
        .select("*")
        .eq("owner_id", owner)
        .eq("idempotency_key", idempotencyKey)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    return row ? parseAttempt(row) : null;
  }

  async getOutboxJobByAttempt(attemptId: string): Promise<PublishOutboxJob | null> {
    const sb = ensureAdmin();
    const row = await selectSingle<DbOutboxRow>(
      sb
        .from("marketing_outbox_jobs")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row ? parseOutbox(row) : null;
  }

  async createOutboxJobIfMissing(
    ownerId: string,
    attemptId: string,
    jobType: PublishOutboxJobType = "publish",
  ): Promise<PublishOutboxJob> {
    const owner = requireOwner(ownerId);
    const sb = ensureAdmin();

    const inserted = await sb
      .from("marketing_outbox_jobs")
      .insert({
        owner_id: owner,
        attempt_id: attemptId,
        job_type: jobType,
        status: "pending",
        available_at: new Date().toISOString(),
      })
      .select("*")
      .maybeSingle();
    if (inserted.error) {
      if (!/duplicate|unique/i.test(inserted.error.message ?? "")) {
        throw new MarketingStoreError(
          `publish outbox upsert failed: ${inserted.error.message}`,
          "UNAVAILABLE",
          503,
        );
      }
      const existing = await this.getOutboxJobByAttempt(attemptId);
      if (!existing) {
        throw new MarketingStoreError(
          "Failed to reuse existing outbox job after conflict",
          "UNAVAILABLE",
          503,
        );
      }
      if (existing.status !== "pending") {
        return existing;
      }
      return existing;
    }
    if (!inserted.data) {
      const existing = await this.getOutboxJobByAttempt(attemptId);
      if (!existing) {
        throw new MarketingStoreError(
          "Failed to create or reuse outbox job",
          "UNAVAILABLE",
          503,
        );
      }
      return existing;
    }
    return parseOutbox(inserted.data as DbOutboxRow);
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
    const owner = requireOwner(opts.ownerId);
    const sb = ensureAdmin();
    const { data, error } = await sb.rpc("create_or_reuse_marketing_publish_attempt", {
      p_owner_id: owner,
      p_post_id: opts.postId,
      p_content_revision_key: opts.contentRevisionKey,
      p_provider: opts.provider,
      p_provider_account_id: opts.providerAccountId,
      p_idempotency_key: opts.idempotencyKey,
      p_request_hash: opts.requestHash,
    });

    if (error) {
      throw new MarketingStoreError(
        `publish attempt create/reuse failed: ${error.message}`,
        "UNAVAILABLE",
        503,
      );
    }

    const payload = firstRow<(RpcAttemptRow & { attempt_id?: string })>(
      data as unknown as RpcAttemptRow[] | null,
    );
    if (!payload?.attempt || !payload?.outbox_job) {
      throw new MarketingStoreError(
        "publish attempt creation returned no payload",
        "UNAVAILABLE",
        503,
      );
    }

    return {
      attempt: parseAttempt(payload.attempt as DbAttemptRow),
      outboxJob: parseOutbox(payload.outbox_job as DbOutboxRow),
    };
  }

  async claimNextOutboxJob(
    leaseOwner: string,
    leaseMs = 30_000,
  ): Promise<PublishOutboxJob | null> {
    if (!leaseOwner?.trim()) {
      throw new MarketingStoreError("leaseOwner is required", "UNAUTHORIZED", 401);
    }
    const sb = ensureAdmin();
    const rows = await executeQuery<DbOutboxRow>(
      sb.rpc("claim_marketing_outbox_job", {
        p_lease_owner: leaseOwner,
        p_lease_milliseconds: leaseMs,
      }) as unknown as Promise<{ data: DbOutboxRow[] | null; error: { message?: string } | null }>,
    );

    if (!rows.length) return null;
    return parseOutbox(rows[0]);
  }

  async renewOutboxLease(
    jobId: string,
    leaseOwner: string,
    leaseMs = 30_000,
  ): Promise<PublishOutboxJob> {
    const owner = leaseOwner?.trim() || "worker";
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Math.max(leaseMs, 5_000)).toISOString();
    const sb = ensureAdmin();
    const row = await selectSingle<DbOutboxRow>(
      sb
        .from("marketing_outbox_jobs")
        .update({
          lease_owner: owner,
          lease_expires_at: expiresAt,
          updated_at: now,
        })
        .eq("id", jobId)
        .eq("lease_owner", owner)
        .select("*")
        .single(),
    );
    if (!row) {
      throw new MarketingStoreError("Outbox job not found or lease ownership changed", "POST_NOT_FOUND", 404);
    }
    return parseOutbox(row);
  }

  async updateAttemptStatus(
    attemptId: string,
    status: PublishAttemptStatus,
    patch: Record<string, unknown> = {},
  ): Promise<PublishAttempt> {
    const sb = ensureAdmin();
    const current = await selectSingle<DbAttemptRow>(
      sb
        .from("marketing_publish_attempts")
        .select("status")
        .eq("id", attemptId)
        .single(),
    );
    if (!current) {
      throw new MarketingStoreError("Attempt not found", "POST_NOT_FOUND", 404);
    }
    const currentStatus = assertStatus<PublishAttemptStatus>(
      String(current.status ?? "pending"),
      PUBLISH_ATTEMPT_STATUSES,
      "attempt status",
    );
    assertPublishAttemptTransition(currentStatus, status);

    const payload = {
      ...patch,
      status,
      updated_at: new Date().toISOString(),
    };

    const row = await selectSingle<DbAttemptRow>(
      sb
        .from("marketing_publish_attempts")
        .update(payload)
        .eq("id", attemptId)
        .eq("status", currentStatus)
        .select("*")
        .single(),
    );
    if (!row) {
      throw new MarketingStoreError(
        "Attempt not found or status changed during update",
        "INVALID_TRANSITION",
        409,
      );
    }
    return parseAttempt(row);
  }

  async markAttemptExecuting(attemptId: string): Promise<PublishAttempt> {
    const sb = ensureAdmin();
    const current = await selectSingle<DbAttemptRow>(
      sb
        .from("marketing_publish_attempts")
        .select("status,attempt_count")
        .eq("id", attemptId)
        .single(),
    );
    if (!current) {
      throw new MarketingStoreError("Attempt not found", "POST_NOT_FOUND", 404);
    }
    const nextCount = Math.max(
      0,
      Number.isFinite(Number(current.attempt_count))
        ? Math.floor(Number(current.attempt_count))
        : 0,
    ) + 1;
    return this.updateAttemptStatus(
      attemptId,
      "executing",
      {
        started_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
        attempt_count: nextCount,
      },
    );
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
      completed_at: new Date().toISOString(),
      outcome_unknown: false,
      last_error_code: null,
      last_error_message: null,
    });
  }

  async completeOutboxJob(jobId: string): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "completed", {
      lease_owner: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
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
    });
  }

  async markOutcomeUnknown(
    attemptId: string,
    opts: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "outcome_unknown", {
      last_error_code: opts.errorCode ?? "OUTCOME_UNKNOWN",
      last_error_message: opts.message ?? "Provider outcome unknown",
      outcome_unknown: true,
      next_retry_at: null,
    });
  }

  async markRetryableFailure(
    attemptId: string,
    opts: { errorCode?: string | null; message?: string | null; availableAt?: string | null },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "retryable_failure", {
      last_error_code: opts.errorCode ?? "RETRYABLE_FAILURE",
      last_error_message: opts.message ?? "Provider call failure",
      outcome_unknown: false,
      next_retry_at: opts.availableAt ?? null,
    });
  }

  async markPermanentFailure(
    attemptId: string,
    opts: { errorCode?: string | null; message?: string | null },
  ): Promise<PublishAttempt> {
    return this.updateAttemptStatus(attemptId, "permanent_failure", {
      last_error_code: opts.errorCode ?? "PERMANENT_FAILURE",
      last_error_message: opts.message ?? "Provider call failed",
      outcome_unknown: false,
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

  async rescheduleOutboxJob(
    jobId: string,
    options?: { availableAt?: string; errorCode?: string | null; message?: string | null },
  ): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "retryable_failure", {
      available_at: options?.availableAt ?? new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error_code: options?.errorCode ?? null,
      last_error_message: options?.message ?? null,
    });
  }

  async cancelOutboxJob(jobId: string): Promise<PublishOutboxJob> {
    return this.updateOutboxStatus(jobId, "cancelled", {
      lease_owner: null,
      lease_expires_at: null,
    });
  }

  async releaseExpiredLeases(): Promise<number> {
    const sb = ensureAdmin();
    const { data, error } = await sb.rpc("release_expired_marketing_outbox_leases");
    if (error) {
      throw new MarketingStoreError(
        `release expired leases failed: ${error.message}`,
        "UNAVAILABLE",
        503,
      );
    }
    const value =
      typeof data === "number"
        ? data
        : Number((data as { release_expired_marketing_outbox_leases?: number })?.release_expired_marketing_outbox_leases ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  async listAttemptsForOwner(ownerId: string): Promise<
    Array<{ attempt: PublishAttempt; job: PublishOutboxJob | null }>
  > {
    const owner = requireOwner(ownerId);
    const sb = ensureAdmin();
    const attempts = await executeQuery<DbAttemptRow>(
      sb
        .from("marketing_publish_attempts")
        .select("*")
        .eq("owner_id", owner)
        .order("updated_at", { ascending: false }),
    );

    if (!attempts.length) return [];

    const ids = attempts.map((a) => a.id);
    const jobs = await executeQuery<DbOutboxRow>(
      sb
        .from("marketing_outbox_jobs")
        .select("*")
        .in("attempt_id", ids)
        .order("created_at", { ascending: false }),
    );

    return attempts.map((attemptRaw) => {
      const attempt = parseAttempt(attemptRaw);
      const jobRaw = jobs.find((job) => job.attempt_id === attempt.id);
      return {
        attempt,
        job: jobRaw ? parseOutbox(jobRaw) : null,
      };
    });
  }

  private async updateOutboxStatus(
    jobId: string,
    status: PublishOutboxStatus,
    patch: Record<string, unknown> = {},
  ): Promise<PublishOutboxJob> {
    const sb = ensureAdmin();
    const current = await selectSingle<DbOutboxRow>(
      sb.from("marketing_outbox_jobs").select("status").eq("id", jobId).single(),
    );
    if (!current) {
      throw new MarketingStoreError("Outbox job not found", "POST_NOT_FOUND", 404);
    }
    const currentStatus = assertStatus<PublishOutboxStatus>(
      String(current.status ?? "pending"),
      PUBLISH_OUTBOX_STATUSES,
      "outbox status",
    );
    assertPublishOutboxTransition(currentStatus, status);

    const row = await selectSingle<DbOutboxRow>(
      sb
        .from("marketing_outbox_jobs")
        .update({
          ...patch,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", currentStatus)
        .select("*")
        .single(),
    );
    if (!row) {
      throw new MarketingStoreError(
        "Outbox job not found or status changed during update",
        "INVALID_TRANSITION",
        409,
      );
    }
    return parseOutbox(row);
  }
}
