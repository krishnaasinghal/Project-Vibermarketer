"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  isTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

type Props = {
  className?: string;
  /** Compact icon-only for tight nav rows */
  compact?: boolean;
};

export function ThemeToggle({ className = "", compact = false }: Props) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    // Prefer attribute set by ThemeScript (already painted).
    const fromDom = document.documentElement.getAttribute("data-theme");
    const next = isTheme(fromDom) ? fromDom : resolveTheme(stored);
    setTheme(next);
    applyTheme(next);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      if (e.newValue === "light" || e.newValue === "dark") {
        setTheme(e.newValue);
        applyTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggle() {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme | null) ||
      theme;
    const next: Theme = current === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-ghost focus-ring !px-2.5 !py-1.5 text-sm ${className}`}
      aria-label={label}
      title={label}
    >
      <span className="inline-flex items-center gap-1.5" aria-hidden>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        {compact ? null : (
          <span className="font-mono text-[10px] uppercase tracking-wider">
            {theme === "dark" ? "Light" : "Dark"}
          </span>
        )}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.05 5.05l1.4 1.4M17.55 17.55l1.4 1.4M18.95 5.05l-1.4 1.4M6.45 17.55l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}
