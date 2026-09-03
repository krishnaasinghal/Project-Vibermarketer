"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAuthConfigured } from "@/lib/supabase/config";

type UserBrief = { email: string | null };

export function AuthNav({ initialUser = null }: {
  initialUser?: UserBrief | null;
}) {
  const [user, setUser] = useState<UserBrief | null | undefined>(undefined);
  const configured = isAuthConfigured();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // Prefer server-passed session when present (App shell / marketing nav).
    if (initialUser) {
      setUser(initialUser);
    }

    if (!configured) {
      setUser(null);
      return;
    }

    const hydrate = (authUser: { email?: string | null } | null) => {
      if (cancelled) return;
      setUser(authUser ? { email: authUser.email ?? null } : null);
    };

    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!cancelled) {
          hydrate(sessionData.session?.user ?? null);
        }

        if (!sessionData.session?.user) {
          const { data, error } = await supabase.auth.getUser();
          if (error) {
            if (
              cancelled
                ||
              !(
                error.code === "refresh_token_not_found" ||
                /refresh token/i.test(error.message || "")
              )
            ) {
              return;
            }
            await supabase.auth.signOut({ scope: "local" });
            hydrate(null);
            return;
          }
          hydrate(data.user);
        }

        const listener = supabase.auth.onAuthStateChange((_event, session) => {
          if (cancelled) return;
          hydrate(session?.user ?? null);
        });
        unsubscribe = listener.data.subscription.unsubscribe;
      } catch {
        if (!cancelled) setUser(null);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [configured, initialUser]);

  if (user === undefined) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        …
      </span>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden max-w-[10rem] truncate text-xs text-muted sm:inline"
          title={user.email ?? undefined}
        >
          {user.email}
        </span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-ghost focus-ring !px-3 !py-1.5 text-sm">
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" className="btn-ghost focus-ring !px-3 !py-1.5 text-sm">
        Sign in
      </Link>
      <Link href="/signup" className="btn-primary focus-ring !px-3 !py-1.5 text-sm">
        Start free
      </Link>
    </div>
  );
}
