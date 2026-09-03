import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthBypassed, isAuthConfigured } from "@/lib/supabase/config";
import { runWithWorkspaceOwner } from "@/lib/workspace-context";

export type AuthUser = {
  id: string;
  email?: string;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  if (isAuthBypassed()) {
    return {
      id: "local-bypass",
      email: "local@bypass.dev",
    };
  }

  if (!isAuthConfigured()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Require an authenticated Supabase user for private API routes.
 * Returns 401 JSON when unauthenticated (unless AUTH_BYPASS for local only).
 */
export async function requireUser(): Promise<
  { user: AuthUser } | { error: NextResponse }
> {
  if (isAuthBypassed()) {
    return {
      user: {
        id: "local-bypass",
        email: "local@bypass.dev",
      },
    };
  }

  if (!isAuthConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Auth is not configured" },
        { status: 503 },
      ),
    };
  }

  const user = await getAuthUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user };
}

/** Auth + per-owner workspace context for Memory / dual-write. */
export async function withWorkspace<T>(
  handler: (user: AuthUser) => Promise<T>,
): Promise<T | NextResponse> {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return runWithWorkspaceOwner(auth.user.id, () => handler(auth.user));
}
