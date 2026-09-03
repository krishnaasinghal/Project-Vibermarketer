import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isAuthBypassed,
  isAuthConfigured,
  safeNextPath,
} from "@/lib/supabase/config";

function isPublicApi(path: string): boolean {
  if (path === "/api/waitlist" || path.startsWith("/api/waitlist/")) return true;
  if (path === "/api/apply" || path.startsWith("/api/apply/")) return true;
  if (path === "/api/checkout" || path.startsWith("/api/checkout/")) return true;
  if (
    path === "/api/tools/gravity-audit" ||
    path.startsWith("/api/tools/gravity-audit/")
  ) {
    return true;
  }
  // Ops smoke — no secrets, no provider spend (dual-write / migration readiness).
  if (path === "/api/ready") return true;
  // /api/health/* is private — burns provider quota if public.
  return false;
}

export function isServiceAuthenticatedApi(path: string): boolean {
  return (
    path === "/api/internal/publishing/drain" ||
    path === "/api/internal/publishing/status"
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isAuthConfigured() || isAuthBypassed()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    getSupabaseUrl()!,
    getSupabasePublishableKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Prefer getUser — refreshes session; clear stale refresh tokens quietly.
  let authed = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (
      error &&
      (error.code === "refresh_token_not_found" ||
        /refresh token/i.test(error.message || ""))
    ) {
      await supabase.auth.signOut({ scope: "local" });
      authed = false;
    } else {
      authed = Boolean(data.user?.id);
    }
  } catch {
    authed = false;
  }

  const path = request.nextUrl.pathname;
  const isApp = path === "/app" || path.startsWith("/app/");
  const isPrivateApi =
    path.startsWith("/api/") &&
    !isPublicApi(path) &&
    !isServiceAuthenticatedApi(path);

  if (isPrivateApi && !authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isApp && !authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (authed && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = safeNextPath(request.nextUrl.searchParams.get("next"));
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
