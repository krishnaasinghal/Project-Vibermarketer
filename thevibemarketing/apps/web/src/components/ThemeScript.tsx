import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Inline FOUC guard — runs before paint. Keep sync with `resolveTheme` in theme.ts.
 */
export function ThemeScript() {
  const code = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.style.colorScheme="dark";}})();`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: code }}
      // Next allows this for theme bootstrapping before hydration.
    />
  );
}
