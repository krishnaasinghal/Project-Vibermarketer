import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase-admin";
import { authorizeWorkerRequest } from "@/lib/internal-worker-auth";
import { MarketingStoreError } from "@/lib/marketing-store";

export const runtime = "nodejs";

type AttemptRow = {
  id: string;
  provider: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type OutboxRow = {
  attempt_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

function parseStatus(raw: unknown): string {
  return String(raw ?? "");
}

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

function ensureDb() {
  const sb = getSupabaseAdmin();
  if (!hasSupabaseAdmin() || !sb) {
    throw new MarketingStoreError("Supabase admin unavailable", "UNAVAILABLE", 503);
  }
  return sb;
}

function ageSeconds(iso: string): number {
  const value = Date.now() - new Date(iso).getTime();
  return Number.isFinite(value) ? Math.max(0, Math.floor(value / 1000)) : 0;
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export async function GET(req: Request) {
  const authorization = authorizeWorkerRequest(
    req,
    "internal",
    process.env.INTERNAL_WORKER_SECRET,
  );
  if (!authorization.ok) {
    return unauthorized(authorization.error, authorization.status);
  }

  const sb = ensureDb();

  try {
    const attemptsRows = (await sb
      .from("marketing_publish_attempts")
      .select("id,provider,status,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000)) as { data: AttemptRow[]; error: { message?: string } | null };

    if (attemptsRows.error) {
      throw new MarketingStoreError(
        `attempts query failed: ${attemptsRows.error.message ?? "db error"}`,
        "UNAVAILABLE",
        503,
      );
    }

    const outboxRows = (await sb
      .from("marketing_outbox_jobs")
      .select(
        "attempt_id,status,created_at,updated_at,lease_owner,lease_expires_at",
      )
      .order("updated_at", { ascending: false })
      .limit(5000)) as {
      data: OutboxRow[];
      error: { message?: string } | null;
    };

    if (outboxRows.error) {
      throw new MarketingStoreError(
        `outbox query failed: ${outboxRows.error.message ?? "db error"}`,
        "UNAVAILABLE",
        503,
      );
    }

    const attemptRows = attemptsRows.data ?? [];
    const jobs = outboxRows.data ?? [];

    const totals: Record<string, number> = {};
    const providerTotals: Record<string, number> = {};
    const attemptByStatus: Record<string, number> = {};

    for (const a of attemptRows) {
      const status = parseStatus(a.status);
      inc(attemptByStatus, status);
      inc(totals, "attempts");
      inc(providerTotals, a.provider || "unknown");
    }

    const outboxByStatus: Record<string, number> = {};
    for (const job of jobs) {
      inc(outboxByStatus, parseStatus(job.status));
      inc(totals, "jobs");
    }

    const leased = jobs.filter((job) => job.status === "leased");
    const providerSucceededAttempts = attemptRows.filter(
      (attempt) => attempt.status === "provider_succeeded",
    );
    const pendingOrRetryableJobs = jobs.filter((job) =>
      job.status === "pending" || job.status === "retryable_failure",
    );

    const now = new Date().toISOString();

    const oldestPendingAgeSec = pendingOrRetryableJobs.length
      ? Math.min(...pendingOrRetryableJobs.map((job) => ageSeconds(job.created_at)))
      : null;

    const oldestLeasedAgeSec = leased.length
      ? Math.min(...leased.map((job) => ageSeconds(job.created_at)))
      : null;

    const deadLettered = jobs.filter((job) => job.status === "dead_letter").length;

    const response = {
      generated_at: now,
      counts: {
        total_attempts: totals.attempts ?? 0,
        total_jobs: totals.jobs ?? 0,
        attempt_by_status: attemptByStatus,
        outbox_by_status: outboxByStatus,
        provider_by_attempts: providerTotals,
      },
      queue_health: {
        leased_jobs: leased.length,
        provider_succeeded_not_finalized: providerSucceededAttempts.length,
        pending_or_retryable_jobs: pendingOrRetryableJobs.length,
        dead_lettered_jobs: deadLettered,
        oldest_pending_age_seconds: oldestPendingAgeSec,
        oldest_leased_age_seconds: oldestLeasedAgeSec,
      },
      report_id: `ops-${randomUUID()}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MarketingStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unknown worker status error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
