"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthNav } from "@/components/AuthNav";
import { BrandMark } from "@/components/BrandMark";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SITE_NAME } from "@/lib/site";

/** Marketing CMO — primary product path. */
const fleetItems = [
  { href: "/app", label: "Command center" },
  { href: "/app/cmo", label: "CMO desk" },
  { href: "/app/onboarding", label: "Onboarding" },
  { href: "/app/studio", label: "Studio" },
  { href: "/app/queue", label: "HITL queue" },
  { href: "/app/memory", label: "Brand memory" },
  { href: "/app/report", label: "Weekly report" },
  { href: "/app/connectors", label: "Connect OAuth" },
];

const loopItems = [
  { href: "/app/onboarding", step: "01", label: "Setup" },
  { href: "/app/studio", step: "02", label: "Create" },
  { href: "/app/queue", step: "03", label: "Review" },
  { href: "/app/connectors", step: "04", label: "Publish" },
  { href: "/app/report", step: "05", label: "Learn" },
];

/** VC Brain — secondary (same engine, not company lead). */
const vcBrainItems = [
  { href: "/app/radar", label: "Radar" },
  { href: "/app/compare", label: "Gravity compare" },
  { href: "/app/query", label: "NL query" },
  { href: "/app/thesis", label: "Thesis" },
  { href: "/app/apply", label: "Inbound" },
];

function NavLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string | null;
}) {
  const active =
    href === "/app"
      ? pathname === "/app"
      : pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      prefetch
      className={`focus-ring block border-l-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-transparent text-muted hover:border-line hover:bg-bg-elevated hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

export function AppShell({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  /** Server-resolved session — avoids “Sign in” flash when client cookie hydrate lags. */
  initialUser?: { email: string | null } | null;
}) {
  const pathname = usePathname();
  const [fleetOpen, setFleetOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [vcOpen, setVcOpen] = useState(
    Boolean(
      pathname?.startsWith("/app/radar") ||
        pathname?.startsWith("/app/compare") ||
        pathname?.startsWith("/app/query") ||
        pathname?.startsWith("/app/thesis") ||
        pathname?.startsWith("/app/apply") ||
        pathname?.startsWith("/app/founders"),
    ),
  );

  return (
    <div className="site-shell flex min-h-[calc(100vh-0px)] flex-col gap-8 py-8 md:flex-row md:gap-10">
      <aside className="w-full shrink-0 border-b border-line pb-5 md:sticky md:top-8 md:max-h-[calc(100vh-4rem)] md:w-56 md:self-start md:overflow-y-auto md:border-b-0 md:border-r md:pb-0 md:pr-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-2 font-display text-base font-bold tracking-tight"
            aria-label={`${SITE_NAME} home`}
          >
            <BrandMark className="h-7 w-7 shrink-0" />
            <span>
              <span className="text-accent">vibe</span>
              <span className="text-ink">marketer</span>
            </span>
          </Link>
          <button
            type="button"
            className="focus-ring border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-widest md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="app-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? "Close" : "Menu"}
          </button>
        </div>
        <div className="hidden md:block">
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-accent">
            App · AI CMO
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted">⌘K shortcuts</p>
        </div>
        <ol className="mt-4 grid grid-cols-5 border border-line md:hidden" aria-label="Marketing loop">
          {loopItems.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="min-w-0 border-r border-line last:border-r-0">
                <Link
                  href={item.href}
                  className={`focus-ring flex min-h-12 flex-col justify-center px-1 text-center ${
                    active ? "bg-accent text-white" : "bg-bg-elevated text-muted"
                  }`}
                >
                  <span className="font-mono text-[8px] opacity-70">{item.step}</span>
                  <span className="truncate font-mono text-[9px] uppercase tracking-tight">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AuthNav initialUser={initialUser} />
          <ThemeToggle compact />
        </div>
        <nav
          id="app-navigation"
          className={`${mobileNavOpen ? "flex" : "hidden"} mt-5 max-h-[50vh] flex-col gap-0.5 overflow-y-auto md:flex md:max-h-none`}
          aria-label="App navigation"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 pb-1 text-left font-mono text-[10px] uppercase tracking-widest text-muted hover:text-ink"
            onClick={() => setFleetOpen((o) => !o)}
          >
            Marketing fleet
            <span aria-hidden>{fleetOpen ? "−" : "+"}</span>
          </button>
          {fleetOpen
            ? fleetItems.map((i) => (
                <NavLink
                  key={i.href}
                  href={i.href}
                  label={i.label}
                  pathname={pathname}
                />
              ))
            : null}
          <button
            type="button"
            className="mt-4 flex w-full items-center justify-between px-3 pb-1 text-left font-mono text-[10px] uppercase tracking-widest text-muted hover:text-ink"
            onClick={() => setVcOpen((o) => !o)}
          >
            VC Brain
            <span aria-hidden>{vcOpen ? "−" : "+"}</span>
          </button>
          {vcOpen
            ? vcBrainItems.map((i) => (
                <NavLink
                  key={i.href}
                  href={i.href}
                  label={i.label}
                  pathname={pathname}
                />
              ))
            : null}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 rise">{children}</div>
      <CommandPalette />
    </div>
  );
}
