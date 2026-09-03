"use client";

import { useEffect, useId, useState } from "react";

type Props = {
  code: string;
  title?: string;
  caption?: string;
  className?: string;
};

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

const CDN_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js";
const LOAD_TIMEOUT_MS = 12_000;

function readTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function themeVariables(mode: "dark" | "light") {
  if (mode === "light") {
    return {
      darkMode: false,
      background: "#ffffff",
      primaryColor: "#e8f0c8",
      primaryTextColor: "#12161c",
      primaryBorderColor: "#6d8f00",
      secondaryColor: "#f2f4f7",
      tertiaryColor: "#ffffff",
      lineColor: "#5a6b7d",
      textColor: "#12161c",
      mainBkg: "#f2f4f7",
      nodeBorder: "#d5dbe3",
      clusterBkg: "#f2f4f7",
      clusterBorder: "#d5dbe3",
      titleColor: "#12161c",
      edgeLabelBackground: "#ffffff",
      actorBkg: "#f2f4f7",
      actorBorder: "#6d8f00",
      actorTextColor: "#12161c",
      signalColor: "#5a6b7d",
      signalTextColor: "#12161c",
      noteBkgColor: "#e8f0c8",
      noteTextColor: "#12161c",
      noteBorderColor: "#6d8f00",
    };
  }
  return {
    darkMode: true,
    background: "#12151a",
    primaryColor: "#243041",
    primaryTextColor: "#e8ecf1",
    primaryBorderColor: "#d4ff4a",
    secondaryColor: "#161a21",
    tertiaryColor: "#0b0d10",
    lineColor: "#8b9cb3",
    textColor: "#e8ecf1",
    mainBkg: "#161a21",
    nodeBorder: "#243041",
    clusterBkg: "#12151a",
    clusterBorder: "#243041",
    titleColor: "#e8ecf1",
    edgeLabelBackground: "#12151a",
    actorBkg: "#161a21",
    actorBorder: "#d4ff4a",
    actorTextColor: "#e8ecf1",
    signalColor: "#8b9cb3",
    signalTextColor: "#e8ecf1",
    noteBkgColor: "#243041",
    noteTextColor: "#e8ecf1",
    noteBorderColor: "#d4ff4a",
  };
}

let loadPromise: Promise<MermaidApi> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

function loadMermaidFromCdn(): Promise<MermaidApi> {
  if (typeof window !== "undefined" && window.mermaid) {
    return Promise.resolve(window.mermaid);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.mermaid) resolve(window.mermaid);
      else reject(new Error("Mermaid CDN loaded but window.mermaid missing"));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-mermaid-cdn]",
    );
    if (existing) {
      if (window.mermaid) {
        finish();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Mermaid CDN")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = CDN_URL;
    script.async = true;
    script.dataset.mermaidCdn = "1";
    script.crossOrigin = "anonymous";
    script.onload = finish;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Mermaid CDN"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

async function loadMermaidNpmFallback(): Promise<MermaidApi> {
  const mod = await import("mermaid");
  const api = (mod.default ?? mod) as MermaidApi;
  window.mermaid = api;
  return api;
}

async function loadMermaid(): Promise<MermaidApi> {
  try {
    return await withTimeout(loadMermaidFromCdn(), LOAD_TIMEOUT_MS, "Mermaid CDN");
  } catch {
    loadPromise = null;
    return withTimeout(
      loadMermaidNpmFallback(),
      LOAD_TIMEOUT_MS,
      "Mermaid package",
    );
  }
}

/** Client-only Mermaid — CDN first, npm package fallback. */
export function MermaidDiagram({
  code,
  title,
  caption,
  className = "",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setTheme(readTheme());
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setError(null);
    setPhase("loading");

    void (async () => {
      try {
        const api = await loadMermaid();
        if (cancelled) return;
        api.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: themeVariables(theme),
          fontFamily: "var(--font-body), system-ui, sans-serif",
          flowchart: { curve: "basis", padding: 16, htmlLabels: true },
          sequence: { mirrorActors: false, messageAlign: "left" },
        });
        const id = `mmd${uid}${theme}${Date.now().toString(36)}`;
        const { svg: out } = await withTimeout(
          api.render(id, code.trim()),
          LOAD_TIMEOUT_MS,
          "Mermaid render",
        );
        if (cancelled) return;
        setSvg(out);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Diagram failed to render");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, theme, uid]);

  return (
    <figure
      className={`blog-diagram my-8 overflow-hidden border border-line bg-bg-panel ${className}`}
    >
      {title ? (
        <figcaption className="border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted">
          {title}
        </figcaption>
      ) : null}
      <div className="relative overflow-x-auto px-3 py-5 sm:px-5">
        {phase === "loading" ? (
          <div
            className="blog-mermaid-skeleton"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="blog-mermaid-skeleton-bar" />
            <div className="blog-mermaid-skeleton-bar w-[72%]" />
            <div className="blog-mermaid-skeleton-bar w-[88%]" />
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">
              Rendering diagram…
            </p>
          </div>
        ) : null}
        {phase === "error" && error ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-danger">
              Diagram unavailable
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted">
              {error}
            </pre>
            <pre className="overflow-x-auto whitespace-pre-wrap border border-line bg-bg-elevated p-3 font-mono text-[11px] leading-relaxed text-ink">
              {code.trim()}
            </pre>
          </div>
        ) : null}
        {phase === "ready" && svg ? (
          <div
            className="blog-mermaid blog-mermaid-fade flex justify-center [&_svg]:max-w-full"
            role="img"
            aria-label={title ?? "Architecture diagram"}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : null}
      </div>
      {caption ? (
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}
