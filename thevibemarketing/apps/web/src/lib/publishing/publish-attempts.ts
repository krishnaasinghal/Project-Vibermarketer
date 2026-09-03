import { createHash } from "node:crypto";
import type { Post, Platform } from "@/lib/marketing-store";

export const PUBLISH_ATTEMPT_STATUSES = [
  "pending",
  "executing",
  "provider_succeeded",
  "outcome_unknown",
  "retryable_failure",
  "permanent_failure",
  "published",
  "cancelled",
] as const;

export type PublishAttemptStatus =
  | "pending"
  | "executing"
  | "provider_succeeded"
  | "outcome_unknown"
  | "retryable_failure"
  | "permanent_failure"
  | "published"
  | "cancelled";

export const PUBLISH_OUTBOX_STATUSES = [
  "pending",
  "leased",
  "completed",
  "retryable_failure",
  "dead_letter",
  "cancelled",
] as const;

export type PublishOutboxStatus =
  | "pending"
  | "leased"
  | "completed"
  | "retryable_failure"
  | "dead_letter"
  | "cancelled";

export type PublishOutboxJobType = "publish" | "confirm_publish";

export type PublishAttempt = {
  id: string;
  owner_id: string;
  post_id: string;
  content_revision_key: string;
  provider: Platform;
  provider_account_id: string;
  idempotency_key: string;
  request_hash: string;
  status: PublishAttemptStatus;
  provider_post_id: string | null;
  provider_url: string | null;
  provider_response: Record<string, unknown> | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  outcome_unknown: boolean;
  next_retry_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublishOutboxJob = {
  id: string;
  owner_id: string;
  attempt_id: string;
  job_type: PublishOutboxJobType;
  status: PublishOutboxStatus;
  available_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const ATTEMPT_TRANSITIONS: Record<PublishAttemptStatus, readonly PublishAttemptStatus[]> = {
  pending: [
    "executing",
    "provider_succeeded",
    "outcome_unknown",
    "retryable_failure",
    "permanent_failure",
    "cancelled",
  ],
  executing: [
    "provider_succeeded",
    "outcome_unknown",
    "retryable_failure",
    "permanent_failure",
    "cancelled",
  ],
  provider_succeeded: ["published", "retryable_failure", "cancelled"],
  outcome_unknown: ["cancelled"],
  retryable_failure: ["executing", "outcome_unknown", "published", "cancelled"],
  permanent_failure: ["cancelled"],
  published: [],
  cancelled: [],
};

export const OUTBOX_TRANSITIONS: Record<
  PublishOutboxStatus,
  readonly PublishOutboxStatus[]
> = {
  pending: ["leased", "retryable_failure", "dead_letter", "cancelled", "completed"],
  leased: [
    "pending",
    "completed",
    "retryable_failure",
    "dead_letter",
    "cancelled",
  ],
  completed: [],
  retryable_failure: ["pending", "dead_letter", "cancelled", "completed"],
  dead_letter: ["pending", "cancelled"],
  cancelled: [],
};

export function canTransitionPublishAttempt(
  from: PublishAttemptStatus,
  to: PublishAttemptStatus,
): boolean {
  if (from === to) return true;
  return ATTEMPT_TRANSITIONS[from]?.includes(to) === true;
}

export function canTransitionOutboxJob(
  from: PublishOutboxStatus,
  to: PublishOutboxStatus,
): boolean {
  if (from === to) return true;
  return OUTBOX_TRANSITIONS[from]?.includes(to) === true;
}

export function assertPublishAttemptTransition(
  from: PublishAttemptStatus,
  to: PublishAttemptStatus,
): void {
  if (canTransitionPublishAttempt(from, to)) return;
  const e = new Error(`Invalid publish attempt transition ${from} -> ${to}`) as Error & {
    code?: string;
    status?: number;
  };
  e.code = "INVALID_ATTEMPT_TRANSITION";
  e.status = 409;
  throw e;
}

export function assertPublishOutboxTransition(
  from: PublishOutboxStatus,
  to: PublishOutboxStatus,
): void {
  if (canTransitionOutboxJob(from, to)) return;
  const e = new Error(
    `Invalid publish outbox transition ${from} -> ${to}`,
  ) as Error & { code?: string; status?: number };
  e.code = "INVALID_OUTBOX_TRANSITION";
  e.status = 409;
  throw e;
}

export function contentFingerprint(value: string | null | undefined): string {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex")
    .slice(0, 16);
}

export function buildContentRevisionKey(post: {
  body: string;
  title?: string | null;
  rationale: string;
  platform: Platform;
  media_url?: string | null;
}): string {
  const payload = {
    platform: post.platform,
    body: post.body.trim(),
    title: post.title ?? null,
    rationale: post.rationale,
    media_url: post.media_url ?? null,
  };
  const raw = JSON.stringify(payload);
  return createHash("sha256").update(raw).digest("hex").slice(0, 48);
}

export function buildPublishIdempotencyKey(input: {
  ownerId: string;
  postId: string;
  provider: string;
  providerAccountId: string;
  contentRevisionKey: string;
}): string {
  const raw = JSON.stringify({
    ownerId: input.ownerId,
    postId: input.postId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    contentRevisionKey: input.contentRevisionKey,
  });
  return createHash("sha256").update(raw).digest("hex");
}

export function buildPublishRequestHash(input: {
  post: Pick<Post, "platform" | "title" | "body" | "rationale" | "media_url">;
  provider: string;
  providerAccountId: string;
  contentRevisionKey: string;
}): string {
  const payload = {
    post: {
      platform: input.post.platform,
      title: input.post.title ?? null,
      body: input.post.body.trim(),
      rationale: input.post.rationale,
      media_url: input.post.media_url ?? null,
    },
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    contentRevisionKey: input.contentRevisionKey,
    run: "publish",
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type PublishFailureKind = "retryable" | "permanent" | "unknown";

export function classifyPublishFailure(error: unknown): PublishFailureKind {
  const msg =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "unknown";
  const text = msg.toLowerCase();
  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("request timed out") ||
    text.includes("deadline exceeded")
  ) {
    return "unknown";
  }

  if (
    text.includes("network") ||
    text.includes("econnreset") ||
    text.includes("econnrefused") ||
    text.includes("connection reset") ||
    text.includes("enotfound") ||
    text.includes("socket hang up")
  ) {
    return "retryable";
  }

  if (
    text.includes("no active") ||
    text.includes("provider account") ||
    text.includes("missing") ||
    text.includes("required") ||
    text.includes("rejected") ||
    text.includes("unsupported") ||
    text.includes("permission") ||
    text.includes("invalid")
  ) {
    return "permanent";
  }

  return "unknown";
}

export function calculateNextRetryAt(
  attemptCount: number,
  now = new Date(),
): string {
  const safe = Math.max(0, Math.floor(attemptCount));
  const minutes = Math.min(60, 2 ** Math.min(safe, 8));
  const jitterRange = Math.max(1, Math.floor(minutes / 10));
  const jitter = deterministicJitter(`${attemptCount}${now.toISOString()}`, jitterRange);
  const finalMinutes = minutes + jitter;
  return new Date(now.getTime() + finalMinutes * 60_000).toISOString();
}

function deterministicJitter(seed: string, max: number): number {
  if (max <= 0) return 0;
  const raw = createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 8);
  const n = Number.parseInt(raw, 16);
  return n % max;
}

export function parseDbProviderResponse(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}
