export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "vibemarketer-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** Resolve theme: stored preference → system → dark (brand default). */
export function resolveTheme(stored: string | null | undefined): Theme {
  if (isTheme(stored)) return stored;
  if (typeof window !== "undefined") {
    try {
      if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
    } catch {
      /* ignore */
    }
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        "content",
        theme === "light" ? "#f2f4f7" : "#0b0d10",
      );
    }
  } catch {
    /* ignore */
  }
}
