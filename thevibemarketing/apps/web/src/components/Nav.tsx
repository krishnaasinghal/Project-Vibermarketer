"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNav } from "@/components/AuthNav";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isAuthConfigured } from "@/lib/supabase/config";
import { SITE_NAME } from "@/lib/site";

const links = [
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/get-started", label: "Get started" },
  { href: "/blog", label: "Blog" },
  { href: "/demo", label: "Demo" },
];

type NavProps = {
  initialAuthed?: boolean;
  initialUserEmail?: string | null;
};

export function Nav({
  initialAuthed = false,
  initialUserEmail,
}: NavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(initialAuthed);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    setAuthed(initialAuthed);

    if (!isAuthConfigured()) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!cancelled) setAuthed(Boolean(sessionData.session?.user));

        const listener = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) setAuthed(Boolean(session?.user));
        });
        unsubscribe = listener.data.subscription.unsubscribe;
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [pathname, initialAuthed]);

  if (pathname?.startsWith("/app")) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="site-shell flex h-14 items-center justify-between gap-3">
        <Link
          href="/"
          className="focus-ring inline-flex shrink-0 items-center gap-2 tracking-tight"
          aria-label={`${SITE_NAME} home`}
        >
          <BrandMark className="h-8 w-8 shrink-0" />
          <span className="font-display text-lg font-bold tracking-tight">
            <span className="text-accent">vibe</span>
            <span className="text-ink">marketer</span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-4 lg:!flex"
          aria-label="Primary"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`focus-ring text-sm transition hover:text-accent ${
                pathname === l.href || pathname?.startsWith(`${l.href}/`)
                  ? "text-accent"
                  : "text-muted"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <ThemeToggle compact />
          {/* One account action cluster — not mixed with Start free + Open app */}
          {authed ? (
            <Link
              href="/app/cmo"
              className="btn-primary focus-ring !px-3 !py-1.5 text-sm"
            >
              Dashboard
            </Link>
          ) : null}
          <AuthNav
            initialUser={
              initialAuthed
                ? { email: initialUserEmail ?? null }
                : null
            }
          />
        </nav>

        <div className="flex items-center gap-2 lg:!hidden">
          <ThemeToggle compact />
          <button
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="border-t border-line px-4 py-3 lg:hidden"
          aria-label="Mobile"
        >
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="focus-ring block rounded px-2 py-2.5 text-sm text-muted hover:bg-bg-elevated hover:text-accent"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-3 border-t border-line pt-3">
              {authed ? (
                <Link
                  href="/app/cmo"
                  className="btn-primary focus-ring w-full !py-2.5 text-center text-sm"
                  onClick={() => setOpen(false)}
                >
                  Dashboard
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/signup"
                    className="btn-primary focus-ring w-full !py-2.5 text-center text-sm"
                    onClick={() => setOpen(false)}
                  >
                    Start free
                  </Link>
                  <Link
                    href="/login"
                    className="btn-ghost focus-ring w-full !py-2.5 text-center text-sm"
                    onClick={() => setOpen(false)}
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </li>
            <li className="pt-2">
              <ThemeToggle />
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
