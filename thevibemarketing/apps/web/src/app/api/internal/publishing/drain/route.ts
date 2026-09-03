import { NextResponse } from "next/server";
import { authorizeWorkerRequest } from "@/lib/internal-worker-auth";
import { executePublishOutboxBatch } from "@/lib/publishing/publish-attempt-service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type DrainBody = {
  batchSize?: number;
  leaseMs?: number;
  leaseOwner?: string;
};

function normalizeHeaderValue(value: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function unauthorized(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function drain(
  req: Request,
  body: DrainBody,
  defaultLeaseOwner: string,
) {
  const batchSizeRaw = Number(body.batchSize);
  const leaseMsRaw = Number(body.leaseMs);
  const leaseOwner =
    normalizeHeaderValue(req.headers.get("x-internal-worker")) ||
    body.leaseOwner?.trim() ||
    defaultLeaseOwner;

  const result = await executePublishOutboxBatch({
    leaseOwner,
    batchSize: Number.isFinite(batchSizeRaw) ? batchSizeRaw : 5,
    leaseMs: Number.isFinite(leaseMsRaw) ? leaseMsRaw : 30_000,
  });

  const response = {
    processed: result.processed,
    claimed: result.claimed,
    skipped: result.skipped,
    errors: result.errors,
  };

  return NextResponse.json(response);
}

export async function GET(req: Request) {
  const authorization = authorizeWorkerRequest(
    req,
    "cron",
    process.env.CRON_SECRET,
  );
  if (!authorization.ok) {
    return unauthorized(authorization.error, authorization.status);
  }

  const { searchParams } = new URL(req.url);
  return drain(
    req,
    {
      batchSize: Number(searchParams.get("batchSize")),
      leaseMs: Number(searchParams.get("leaseMs")),
    },
    "vercel-cron",
  );
}

export async function POST(req: Request) {
  const authorization = authorizeWorkerRequest(
    req,
    "internal",
    process.env.INTERNAL_WORKER_SECRET,
  );
  if (!authorization.ok) {
    return unauthorized(authorization.error, authorization.status);
  }

  let body: DrainBody = {};
  try {
    body = (await req.json()) as DrainBody;
  } catch {
    body = {};
  }

  return drain(req, body, `internal-${Date.now()}`);
}
