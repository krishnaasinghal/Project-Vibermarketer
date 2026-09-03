import { NextResponse, type NextRequest } from "next/server";
import {
  isAllowedRedirectUrl,
  isAuthConfigured,
  safeNextPath,
} from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** OAuth + email-confirm PKCE exchange. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!isAuthConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next.includes("://") || next.includes("//")) {
        return NextResponse.redirect(`${origin}/login?error=redirect`);
      }
      const redirectUrl = new URL(next, origin);
      if (!isAllowedRedirectUrl(redirectUrl, origin)) {
        return NextResponse.redirect(`${origin}/login?error=redirect`);
      }
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
