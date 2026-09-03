import { createHash, timingSafeEqual } from "node:crypto";

export type WorkerAuthMode = "cron" | "internal";

export type WorkerAuthorization =
  | { ok: true }
  | { ok: false; status: 401; error: string };

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function secretsMatch(provided: string, configured: string): boolean {
  if (!provided || !configured) return false;

  const providedHash = createHash("sha256").update(provided).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(providedHash, configuredHash);
}

export function authorizeWorkerRequest(
  request: Request,
  mode: WorkerAuthMode,
  configuredSecret: string | undefined,
): WorkerAuthorization {
  const secret = configuredSecret?.trim() ?? "";
  const envName = mode === "cron" ? "CRON_SECRET" : "INTERNAL_WORKER_SECRET";

  if (!secret) {
    return {
      ok: false,
      status: 401,
      error: `${envName} is not configured`,
    };
  }

  const provided =
    mode === "internal"
      ? request.headers.get("x-internal-secret")?.trim() || bearerToken(request)
      : bearerToken(request);

  if (!secretsMatch(provided, secret)) {
    return {
      ok: false,
      status: 401,
      error: `Invalid ${mode} worker secret`,
    };
  }

  return { ok: true };
}
