import {
  composioHealth,
  e2bHealth,
  isSupermemoryConfigured,
  openaiChatHealth,
  searchMemories,
  xaiHealth,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isPostgresDualEnabled } from "@/lib/postgres-dual";

export const runtime = "nodejs";
export const maxDuration = 60;

type KeyRow = {
  key: string;
  configured: boolean;
  ok: boolean;
  detail: string;
};

async function checkOpenAI(): Promise<KeyRow> {
  const h = await openaiChatHealth();
  return {
    key: "OPENAI_API_KEY",
    configured: h.configured,
    ok: h.ok,
    detail: h.ok
      ? h.detail
      : h.http === 429
        ? `chat blocked (${h.detail}) — add billing/quota`
        : h.detail,
  };
}

async function checkFirecrawl(): Promise<KeyRow> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) {
    return {
      key: "FIRECRAWL_API_KEY",
      configured: false,
      ok: false,
      detail: "unset",
    };
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com",
        formats: ["markdown"],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    return {
      key: "FIRECRAWL_API_KEY",
      configured: true,
      ok: res.ok,
      detail: res.ok ? "scrape OK" : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      key: "FIRECRAWL_API_KEY",
      configured: true,
      ok: false,
      detail: e instanceof Error ? e.message : "failed",
    };
  }
}

async function checkGithub(): Promise<KeyRow> {
  const key = process.env.GITHUB_TOKEN?.trim();
  if (!key) {
    return { key: "GITHUB_TOKEN", configured: false, ok: false, detail: "unset" };
  }
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "thevibemarketing-health",
      },
      signal: AbortSignal.timeout(12_000),
    });
    return {
      key: "GITHUB_TOKEN",
      configured: true,
      ok: res.ok,
      detail: res.ok ? "user OK" : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      key: "GITHUB_TOKEN",
      configured: true,
      ok: false,
      detail: e instanceof Error ? e.message : "failed",
    };
  }
}

async function checkTavily(): Promise<KeyRow> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) {
    return { key: "TAVILY_API_KEY", configured: false, ok: false, detail: "unset" };
  }
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "ping", max_results: 1 }),
      signal: AbortSignal.timeout(15_000),
    });
    return {
      key: "TAVILY_API_KEY",
      configured: true,
      ok: res.ok,
      detail: res.ok ? "search OK" : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      key: "TAVILY_API_KEY",
      configured: true,
      ok: false,
      detail: e instanceof Error ? e.message : "failed",
    };
  }
}

async function checkSupermemory(): Promise<KeyRow> {
  if (!isSupermemoryConfigured()) {
    return {
      key: "SUPERMEMORY_API_KEY",
      configured: false,
      ok: false,
      detail: "unset",
    };
  }
  const r = await searchMemories({
    q: "brand",
    containerTag: "system:healthcheck",
    limit: 1,
  });
  return {
    key: "SUPERMEMORY_API_KEY",
    configured: true,
    ok: r.ok,
    detail: r.ok ? `search OK · hits=${r.total}` : r.error || "failed",
  };
}

/** GET — authenticated key health (no secret values). Burns provider quota — not public. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const [openai, firecrawl, github, tavily, supermemory, composio, e2b, xai] =
    await Promise.all([
      checkOpenAI(),
      checkFirecrawl(),
      checkGithub(),
      checkTavily(),
      checkSupermemory(),
      composioHealth().then((h) => ({
        key: "COMPOSIO_API_KEY",
        configured: h.configured,
        ok: h.ok,
        detail: h.ok
          ? `toolkits OK · sample=${(h.sample ?? []).join(",")}`
          : h.error || "failed",
      })),
      e2bHealth().then((h) => ({
        key: "E2B_API_KEY",
        configured: h.configured,
        ok: h.ok,
        detail: h.ok
          ? "sandboxes list OK"
          : [h.error, h.hint].filter(Boolean).join(" — "),
      })),
      xaiHealth().then((h) => ({
        key: "XAI_API_KEY",
        configured: h.configured,
        ok: h.ok,
        detail: h.ok
          ? `${h.detail} · Grok Imagine + Vision`
          : h.detail || "failed",
      })),
    ]);

  const keys = [
    openai,
    firecrawl,
    tavily,
    github,
    supermemory,
    composio,
    e2b,
    xai,
  ];
  const pass = keys.filter((k) => k.ok).length;
  const fail = keys.filter((k) => k.configured && !k.ok).length;

  const dual = isPostgresDualEnabled();
  keys.push({
    key: "POSTGRES_DUAL",
    configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    ok: dual,
    detail: dual
      ? "Memory ↔ Supabase dual-write ON (required for durable radar on Vercel)"
      : "OFF — set SUPABASE_SERVICE_ROLE_KEY (+ USE_POSTGRES_DUAL=1 locally). Radar will look empty across serverless instances.",
  });

  return NextResponse.json({
    ok: fail === 0,
    pass,
    fail,
    checkedAt: new Date().toISOString(),
    keys,
    tip: "Full report: pnpm probe:keys → API-KEYS-STATUS.md",
  });
}
