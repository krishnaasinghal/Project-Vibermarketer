import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Always attempt sign-out when Supabase is configured.
 * Do not gate on getClaims() — stale cookies must still clear.
 */
export async function POST(req: NextRequest) {
  if (isAuthConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      /* still clear cookies below */
    }
  }

  revalidatePath("/", "layout");

  const res = NextResponse.redirect(new URL("/login", req.url), {
    status: 302,
  });

  // Belt-and-suspenders: expire common Supabase cookie names on this host.
  const cookieNames = req.cookies.getAll().map((c) => c.name);
  for (const name of cookieNames) {
    if (
      name.includes("sb-") ||
      name.includes("supabase") ||
      name.startsWith("auth-")
    ) {
      res.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  return res;
}
