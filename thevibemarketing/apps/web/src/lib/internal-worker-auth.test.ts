/**
 * Regression: Vercel cron uses GET + Authorization: Bearer $CRON_SECRET.
 * Worker secrets must never be accepted from query strings.
 */
import { GET, POST } from "../app/api/internal/publishing/drain/route";
import { authorizeWorkerRequest } from "./internal-worker-auth";
import { isServiceAuthenticatedApi } from "./supabase/proxy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

const cronRequest = new Request("https://example.com/api/internal/publishing/drain", {
  headers: { authorization: "Bearer cron-secret" },
});
assert(
  authorizeWorkerRequest(cronRequest, "cron", "cron-secret").ok,
  "cron bearer token is accepted",
);

const querySecretRequest = new Request(
  "https://example.com/api/internal/publishing/drain?secret=cron-secret",
);
const queryAuthorization = authorizeWorkerRequest(
  querySecretRequest,
  "cron",
  "cron-secret",
);
assert(!queryAuthorization.ok, "query-string secrets are rejected");
assert(queryAuthorization.status === 401, "rejected query secret is unauthorized");

const internalHeaderRequest = new Request(
  "https://example.com/api/internal/publishing/drain",
  { headers: { "x-internal-secret": "internal-secret" } },
);
assert(
  authorizeWorkerRequest(internalHeaderRequest, "internal", "internal-secret").ok,
  "manual worker header is accepted",
);
assert(
  !authorizeWorkerRequest(internalHeaderRequest, "cron", "internal-secret").ok,
  "cron authentication does not accept the internal header",
);

const missingConfiguration = authorizeWorkerRequest(cronRequest, "cron", "");
assert(!missingConfiguration.ok, "missing cron configuration fails closed");
assert(missingConfiguration.status === 401, "missing configuration is unauthorized");

assert(typeof GET === "function", "drain route exposes GET for Vercel cron");
assert(typeof POST === "function", "drain route retains POST for internal callers");
assert(
  isServiceAuthenticatedApi("/api/internal/publishing/drain"),
  "Supabase proxy passes drain requests to worker authentication",
);
assert(
  isServiceAuthenticatedApi("/api/internal/publishing/status"),
  "Supabase proxy passes status requests to worker authentication",
);
assert(
  !isServiceAuthenticatedApi("/api/internal/publishing/reconcile"),
  "unlisted internal publishing routes remain session-protected",
);
assert(
  !isServiceAuthenticatedApi("/api/marketing/publish-attempts"),
  "user publishing routes remain session-protected",
);

console.log("internal-worker-auth.test: ok");
