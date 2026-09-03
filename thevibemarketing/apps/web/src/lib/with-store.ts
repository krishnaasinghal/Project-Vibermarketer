import { NextResponse } from "next/server";
import { requireUser, type AuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAuthBypassed, isAuthConfigured } from "@/lib/supabase/config";
import { runWithWorkspaceOwner } from "@/lib/workspace-context";
import { checkRateLimit } from "@/lib/auth/rate-limit";

/** Private API: auth required + owner-scoped Memory/Postgres. */
export async function withOwnedStore<T>(
  handler: (user: AuthUser) => Promise<T>,
): Promise<T | NextResponse> {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const limited = checkRateLimit(`private-api:${auth.user.id}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retry_after_seconds: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }
  return runWithWorkspaceOwner(auth.user.id, () => handler(auth.user));
}

/** Public/optional-auth (e.g. inbound apply). */
export async function withOptionalStore<T>(
  handler: (user: AuthUser | null) => Promise<T>,
): Promise<T> {
  let user: AuthUser | null = null;
  if (isAuthBypassed()) {
    user = { id: "local-bypass", email: "local@bypass.dev" };
  } else if (isAuthConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) {
        user = { id: data.user.id, email: data.user.email };
      }
    } catch {
      /* anonymous */
    }
  }
  const owner = user?.id ?? "inbound";
  return runWithWorkspaceOwner(owner, () => handler(user));
}
