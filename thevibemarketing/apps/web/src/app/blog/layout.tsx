import Script from "next/script";
import type { ReactNode } from "react";

/** Prefetch Mermaid on blog routes so diagrams paint faster after hydration. */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"
        strategy="afterInteractive"
        data-mermaid-cdn="1"
        crossOrigin="anonymous"
      />
      {children}
    </>
  );
}
