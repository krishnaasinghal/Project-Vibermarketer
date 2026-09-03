/**
 * Composio connector — live REST when COMPOSIO_API_KEY is set.
 * OAuth: ensure auth_config → POST /v3/connected_accounts/link → redirect_url.
 * Missing configuration is reported as an explicit unavailable error. This connector
 * never returns a pretend OAuth or publish result.
 */

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

export type ComposioConnectResult =
  | {
      status: "ok";
      url: string;
      linkToken?: string;
      connectedAccountId?: string;
      expiresAt?: string;
      toolkit: string;
      authConfigId: string;
    }
  | { status: "error"; message: string; toolkit: string };

export type ComposioExecuteResult =
  | { status: "ok"; data: unknown }
  | { status: "error"; message: string };

export type ComposioHealth = {
  configured: boolean;
  ok: boolean;
  toolkitCount?: number;
  sample?: string[];
  error?: string;
};

export type ComposioConnectedAccount = {
  id: string;
  toolkit: string;
  status: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
};

export type ComposioAccountsResult =
  | {
      status: "ok";
      userId: string;
      accounts: ComposioConnectedAccount[];
      /** UI toolkit id → best status (ACTIVE preferred). */
      byToolkit: Record<string, { status: string; accountId: string }>;
    }
  | { status: "error"; userId: string; message: string };

function apiKey(): string | null {
  return process.env.COMPOSIO_API_KEY?.trim() || null;
}

function headers(key: string): Record<string, string> {
  return {
    "x-api-key": key,
    "Content-Type": "application/json",
  };
}

/** Map UI toolkit ids → Composio toolkit slugs. */
export function normalizeToolkitSlug(toolkit: string): string {
  const t = toolkit.trim().toLowerCase();
  const map: Record<string, string> = {
    twitter: "twitter",
    x: "twitter",
    linkedin: "linkedin",
    reddit: "reddit",
    github: "github",
    gmail: "gmail",
    notion: "notion",
    instagram: "instagram",
    // Google Marketing APIs (require Google Cloud OAuth + privacy policy + often verification)
    google_analytics: "google_analytics",
    googleanalytics: "google_analytics",
    ga: "google_analytics",
    ga4: "google_analytics",
    google_search_console: "google_search_console",
    googlesearchconsole: "google_search_console",
    gsc: "google_search_console",
    searchconsole: "google_search_console",
  };
  return map[t] || t;
}

export async function composioHealth(): Promise<ComposioHealth> {
  const key = apiKey();
  if (!key) {
    return { configured: false, ok: false, error: "COMPOSIO_API_KEY unset" };
  }
  try {
    const res = await fetch(`${COMPOSIO_BASE}/toolkits?limit=5`, {
      headers: headers(key),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        error: `Composio toolkits HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      items?: Array<{ slug?: string; name?: string }>;
      total_items?: number;
    };
    return {
      configured: true,
      ok: true,
      toolkitCount: body.total_items,
      sample: (body.items ?? []).map((i) => i.slug || i.name || "?").slice(0, 5),
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "Composio health failed",
    };
  }
}

async function listAuthConfigs(
  key: string,
  toolkitSlug: string,
): Promise<Array<{ id: string; toolkit?: { slug?: string } }>> {
  const res = await fetch(`${COMPOSIO_BASE}/auth_configs?limit=50`, {
    headers: headers(key),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    items?: Array<{ id: string; toolkit?: { slug?: string } }>;
  };
  return (body.items ?? []).filter(
    (i) => (i.toolkit?.slug || "").toLowerCase() === toolkitSlug.toLowerCase(),
  );
}

async function ensureAuthConfig(
  key: string,
  toolkitSlug: string,
): Promise<string | null> {
  const existing = await listAuthConfigs(key, toolkitSlug);
  if (existing[0]?.id) return existing[0].id;

  const res = await fetch(`${COMPOSIO_BASE}/auth_configs`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      toolkit: { slug: toolkitSlug },
      auth_scheme: "OAUTH2",
      use_composio_auth: true,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // alternate payload shape
    const res2 = await fetch(`${COMPOSIO_BASE}/auth_configs`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        toolkit: { slug: toolkitSlug },
        type: "use_composio_managed_auth",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res2.ok) return null;
    const b2 = (await res2.json()) as { auth_config?: { id?: string } };
    return b2.auth_config?.id ?? null;
  }
  const body = (await res.json()) as { auth_config?: { id?: string } };
  return body.auth_config?.id ?? null;
}

/**
 * Return a hosted OAuth connect link for `toolkit`.
 * Live when COMPOSIO_API_KEY is configured; otherwise returns an unavailable error.
 */
export async function getConnectLink(
  userId: string,
  toolkit: string,
  _options?: { throwIfMissingKey?: boolean },
): Promise<ComposioConnectResult> {
  const uid = userId?.trim() || "anonymous";
  const tk = normalizeToolkitSlug(toolkit || "unknown");
  const key = apiKey();

  if (!key) {
    return {
      status: "error",
      toolkit: tk,
      message: "COMPOSIO_API_KEY not configured — OAuth is unavailable.",
    };
  }

  try {
    const authConfigId = await ensureAuthConfig(key, tk);
    if (!authConfigId) {
      return {
        status: "error",
        toolkit: tk,
        message: `Could not create/find auth_config for toolkit "${tk}"`,
      };
    }

    const res = await fetch(`${COMPOSIO_BASE}/connected_accounts/link`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        user_id: uid,
        auth_config_id: authConfigId,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        status: "error",
        toolkit: tk,
        message: `Composio link HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const body = JSON.parse(text) as {
      redirect_url?: string;
      link_token?: string;
      connected_account_id?: string;
      expires_at?: string;
    };
    if (!body.redirect_url) {
      return {
        status: "error",
        toolkit: tk,
        message: "Composio link OK but no redirect_url in response",
      };
    }
    return {
      status: "ok",
      url: body.redirect_url,
      linkToken: body.link_token,
      connectedAccountId: body.connected_account_id,
      expiresAt: body.expires_at,
      toolkit: tk,
      authConfigId,
    };
  } catch (e) {
    return {
      status: "error",
      toolkit: tk,
      message: e instanceof Error ? e.message : "Composio connect failed",
    };
  }
}

/** Map Composio toolkit slug → UI toolkit id(s). */
function uiToolkitIdsForSlug(slug: string): string[] {
  const s = slug.toLowerCase();
  if (s === "twitter") return ["twitter", "x"];
  return [s];
}

/**
 * List connected accounts for a workspace user (Composio user_id = Supabase uid).
 * Used after OAuth so the connectors page can show Connected without a page reload race.
 */
export async function listConnectedAccounts(
  userId: string,
): Promise<ComposioAccountsResult> {
  const uid = userId?.trim() || "anonymous";
  const key = apiKey();
  if (!key) {
    return {
      status: "error",
      userId: uid,
      message: "COMPOSIO_API_KEY not configured — connected accounts are unavailable.",
    };
  }

  try {
    const params = new URLSearchParams();
    params.append("user_ids", uid);
    params.append("limit", "50");
    // Include ACTIVE + in-flight so UI can show “connecting…”
    for (const st of ["ACTIVE", "INITIATED", "INITIALIZING"]) {
      params.append("statuses", st);
    }

    const res = await fetch(
      `${COMPOSIO_BASE}/connected_accounts?${params.toString()}`,
      {
        headers: headers(key),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      return {
        status: "error",
        userId: uid,
        message: `Composio accounts HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const body = JSON.parse(text) as {
      items?: Array<{
        id?: string;
        user_id?: string;
        status?: string;
        created_at?: string;
        updated_at?: string;
        toolkit?: { slug?: string };
      }>;
    };

    const accounts: ComposioConnectedAccount[] = (body.items ?? [])
      .filter((i) => i.id && i.toolkit?.slug)
      .map((i) => ({
        id: i.id!,
        toolkit: (i.toolkit?.slug || "").toLowerCase(),
        status: (i.status || "UNKNOWN").toUpperCase(),
        user_id: i.user_id || uid,
        created_at: i.created_at,
        updated_at: i.updated_at,
      }));

    const rank = (s: string) =>
      s === "ACTIVE" ? 3 : s === "INITIATED" || s === "INITIALIZING" ? 2 : 1;

    const byToolkit: Record<string, { status: string; accountId: string }> = {};
    for (const a of accounts) {
      for (const uiId of uiToolkitIdsForSlug(a.toolkit)) {
        const prev = byToolkit[uiId];
        if (!prev || rank(a.status) > rank(prev.status)) {
          byToolkit[uiId] = { status: a.status, accountId: a.id };
        }
      }
    }

    return { status: "ok", userId: uid, accounts, byToolkit };
  } catch (e) {
    return {
      status: "error",
      userId: uid,
      message: e instanceof Error ? e.message : "list accounts failed",
    };
  }
}

/**
 * Execute a Composio tool for a connected user.
 * Live REST: POST /api/v3/tools/execute/{toolSlug}
 * Never returns a fake success when the provider fails or is unconnected.
 */
export async function executeTool(
  userId: string,
  tool: string,
  args: Record<string, unknown>,
  options?: {
    connectedAccountId?: string;
    /** Default false — pinning behavior can only be relaxed explicitly. */
    dangerouslySkipVersionCheck?: boolean;
  },
): Promise<ComposioExecuteResult> {
  const uid = userId?.trim() || "anonymous";
  const toolName = tool?.trim() || "unknown";
  const key = apiKey();

  if (!key) {
    return {
      status: "error",
      message: "COMPOSIO_API_KEY not configured — tool execution is unavailable.",
    };
  }

  if (!toolName || toolName === "unknown") {
    return { status: "error", message: "tool slug required" };
  }

  try {
    const body: Record<string, unknown> = {
      user_id: uid,
      arguments: args ?? {},
      dangerously_skip_version_check: options?.dangerouslySkipVersionCheck ?? false,
    };
    if (options?.connectedAccountId) {
      body.connected_account_id = options.connectedAccountId;
    }

    const res = await fetch(
      `${COMPOSIO_BASE}/tools/execute/${encodeURIComponent(toolName)}`,
      {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      },
    );
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    if (!res.ok) {
      const errObj = parsed as {
        error?: { message?: string; suggested_fix?: string };
        message?: string;
      } | null;
      const msg =
        errObj?.error?.message ||
        errObj?.message ||
        `Composio execute HTTP ${res.status}: ${text.slice(0, 240)}`;
      const hint = errObj?.error?.suggested_fix
        ? ` ${errObj.error.suggested_fix}`
        : "";
      return { status: "error", message: `${msg}${hint}`.trim() };
    }

    return { status: "ok", data: parsed };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Composio execute failed",
    };
  }
}

export type MarketingPublishPlatform = "x" | "linkedin" | "reddit";

export type MarketingPublishResult =
  | {
      status: "ok";
      platform: MarketingPublishPlatform;
      providerPostId: string;
      providerUrl: string | null;
      raw: unknown;
    }
  | { status: "error"; platform: MarketingPublishPlatform; message: string };

function digString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    // Providers sometimes return numeric tweet/post ids
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") {
      const hit = digString(v, keys);
      if (hit) return hit;
    }
  }
  return null;
}

type ResponsePath = readonly (string | number)[];

function readAtPath(obj: unknown, path: ResponsePath): unknown {
  let current = obj;
  for (const part of path) {
    if (typeof part === "number") {
      if (!Array.isArray(current)) return null;
      current = current[part];
      continue;
    }
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? null;
}

function stringAtPath(obj: unknown, path: ResponsePath): string | null {
  const value = readAtPath(obj, path);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstMatchingStringAtPath(
  obj: unknown,
  paths: readonly ResponsePath[],
  validate: (candidate: string) => boolean,
): string | null {
  for (const path of paths) {
    const value = stringAtPath(obj, path);
    if (value && validate(value)) return value;
  }
  return null;
}

function isXPostId(candidate: string): boolean {
  return /^\d{10,}$/.test(candidate);
}

function isLinkedInPostId(candidate: string): boolean {
  if (candidate.startsWith("urn:li:")) {
    return /^urn:li:(share|ugcPost|activity):[A-Za-z0-9_-]+$/i.test(candidate);
  }
  return /^\d{10,}$/.test(candidate) || /^li-[a-z0-9-]+$/i.test(candidate);
}

function parseRedditIdFromPermalink(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/comments\/([A-Za-z0-9]{6,})(?:\/(?:[^/]+)?(?:\/?)|$)/);
    return match?.[1] ? match[1] : null;
  } catch {
    return null;
  }
}

function isRedditPostId(candidate: string): boolean {
  if (candidate.startsWith("t3_")) {
    return /^t3_[A-Za-z0-9]+$/.test(candidate);
  }
  return /^[A-Za-z0-9]{6,}$/.test(candidate);
}

export function extractXProviderPostId(resultData: unknown): string | null {
  return firstMatchingStringAtPath(
    resultData,
    [
      ["data", "id"],
      ["data", "id_str"],
      ["data", "tweet_id"],
      ["data", "post_id"],
      ["data", "tweet", "id"],
      ["data", "tweet", "id_str"],
      ["tweet", "id"],
      ["tweet", "id_str"],
      ["result", "data", "id"],
      ["result", "data", "id_str"],
    ],
    isXPostId,
  );
}

export function extractLinkedInProviderPostId(resultData: unknown): string | null {
  return firstMatchingStringAtPath(
    resultData,
    [
      ["data", "id"],
      ["data", "urn"],
      ["data", "post_id"],
      ["data", "share_id"],
      ["data", "activity"],
      ["data", "created_post", "id"],
      ["data", "createdPost", "id"],
      ["result", "data", "id"],
      ["result", "data", "urn"],
      ["result", "data", "activity"],
    ],
    isLinkedInPostId,
  );
}

export function extractRedditProviderPostId(resultData: unknown): string | null {
  const fullname = firstMatchingStringAtPath(
    resultData,
    [
      ["data", "name"],
      ["data", "fullname"],
      ["data", "post_id"],
      ["data", "id"],
      ["result", "data", "name"],
      ["result", "data", "fullname"],
      ["result", "data", "id"],
    ],
    isRedditPostId,
  );
  if (fullname) return fullname;

  for (const path of [
    ["data", "permalink"],
    ["data", "url"],
    ["result", "data", "permalink"],
    ["result", "data", "url"],
  ] as const) {
    const permalink = stringAtPath(resultData, path);
    const parsedFromPermalink = parseRedditIdFromPermalink(permalink);
    if (parsedFromPermalink && isRedditPostId(parsedFromPermalink)) return parsedFromPermalink;
  }

  return null;
}

/**
 * Publish a marketing draft via Composio for the authenticated workspace user.
 * - x/twitter: TWITTER_CREATION_OF_A_POST
 * - linkedin: resolves author URN then LINKEDIN_CREATE_LINKED_IN_POST
 * - reddit: REDDIT_CREATE_REDDIT_POST (requires subreddit in options)
 *
 * Marks nothing itself — caller updates marketing_state only when status=ok
 * with a real providerPostId.
 */
export async function publishMarketingPost(opts: {
  userId: string;
  platform: MarketingPublishPlatform;
  body: string;
  title?: string | null;
  connectedAccountId?: string | null;
  /** Required for reddit self posts. */
  subreddit?: string | null;
  /** Optional flair for subreddits that require it. */
  flairId?: string | null;
}): Promise<MarketingPublishResult> {
  const platform = opts.platform;
  const text = opts.body?.trim() || "";
  if (!text) {
    return { status: "error", platform, message: "post body is empty" };
  }

  const accounts = await listConnectedAccounts(opts.userId);
  if (accounts.status === "error") {
    return { status: "error", platform, message: accounts.message };
  }

  const toolkit =
    platform === "x" ? "twitter" : platform === "linkedin" ? "linkedin" : "reddit";
  const preferredAccountId = opts.connectedAccountId?.trim();
  const conn =
    accounts.byToolkit[toolkit] ||
    (platform === "x" ? accounts.byToolkit["x"] : undefined);
  const account = preferredAccountId
    ? conn && conn.accountId === preferredAccountId
      ? conn
      : null
    : conn;

  if (!account || account.status !== "ACTIVE") {
    return {
      status: "error",
      platform,
      message: `No ACTIVE Composio connection for ${toolkit}. Connect the channel in /app/connectors first.`,
    };
  }

  if (platform === "x") {
    const result = await executeTool(
      opts.userId,
      "TWITTER_CREATION_OF_A_POST",
      { text: text.slice(0, 280) },
      { connectedAccountId: account.accountId },
    );
    if (result.status === "error") {
      return { status: "error", platform, message: result.message };
    }
    // Fail closed: never invent twitter_${Date.now()} — that fakes "published".
    const realId = extractXProviderPostId(result.data);
    if (!realId) {
      return {
        status: "error",
        platform,
        message:
          "X API returned success without a diggable post id — not marking published. Stay queued and retry or post manually.",
      };
    }
    return {
      status: "ok",
      platform,
      providerPostId: realId,
      providerUrl: `https://x.com/i/web/status/${realId}`,
      raw: result.data,
    };
  }

  if (platform === "linkedin") {
    // Resolve author URN required by LINKEDIN_CREATE_LINKED_IN_POST.
    const me = await executeTool(
      opts.userId,
      "LINKEDIN_GET_MY_INFO",
      {},
      { connectedAccountId: account.accountId },
    );
    // Fallbacks if slug differs across Composio versions
    let author: string | null = null;
    if (me.status === "ok") {
      author =
        digString(me.data, ["author_id", "id", "sub", "person_id"]) ||
        digString(me.data, ["urn"]);
      if (author && !author.startsWith("urn:")) {
        author = `urn:li:person:${author}`;
      }
    }
    if (!author) {
      const me2 = await executeTool(
      opts.userId,
      "LINKEDIN_GET_USER_INFO",
      {},
      { connectedAccountId: account.accountId },
    );
      if (me2.status === "ok") {
        author =
          digString(me2.data, ["author_id", "id", "sub"]) ||
          digString(me2.data, ["urn"]);
        if (author && !author.startsWith("urn:")) {
          author = `urn:li:person:${author}`;
        }
      }
    }
    if (!author) {
      return {
        status: "error",
        platform,
        message:
          me.status === "error"
            ? `LinkedIn author lookup failed: ${me.message}`
            : "LinkedIn author URN not found — reconnect LinkedIn or check Composio toolkit tools.",
      };
    }

    const result = await executeTool(
      opts.userId,
      "LINKEDIN_CREATE_LINKED_IN_POST",
      {
        author,
        commentary: text,
        visibility: "PUBLIC",
      },
      { connectedAccountId: account.accountId },
    );
    if (result.status === "error") {
      return { status: "error", platform, message: result.message };
    }
    const postId = extractLinkedInProviderPostId(result.data);
    if (!postId) {
      return {
        status: "error",
        platform,
        message:
          "LinkedIn returned success without a diggable post id — not marking published. Stay queued.",
      };
    }
    return {
      status: "ok",
      platform,
      providerPostId: postId,
      providerUrl: digString(result.data, ["url", "permalink"]),
      raw: result.data,
    };
  }

  // reddit
  const subreddit = opts.subreddit?.trim().replace(/^r\//, "");
  if (!subreddit) {
    return {
      status: "error",
      platform,
      message:
        "Reddit publish requires a subreddit (set on the draft note as subreddit:name or pass subreddit).",
    };
  }
  const title = (opts.title?.trim() || text.slice(0, 80)).slice(0, 300);
  const args: Record<string, unknown> = {
    subreddit,
    title,
    kind: "self",
    text,
  };
  if (opts.flairId?.trim()) args.flair_id = opts.flairId.trim();

  // flair_id is required by schema on some subreddits — try without first if not set
    let result = await executeTool(
      opts.userId,
      "REDDIT_CREATE_REDDIT_POST",
      opts.flairId?.trim()
        ? args
        : { subreddit, title, kind: "self", text, flair_id: "" },
      { connectedAccountId: account.accountId },
    );
    if (result.status === "error" && !opts.flairId) {
    // Retry without empty flair_id key
    result = await executeTool(
      opts.userId,
      "REDDIT_CREATE_REDDIT_POST",
      { subreddit, title, kind: "self", text },
      { connectedAccountId: account.accountId },
    );
  }
  if (result.status === "error") {
    return { status: "error", platform, message: result.message };
  }
  const postId = extractRedditProviderPostId(result.data);
  if (!postId) {
    return {
      status: "error",
      platform,
      message:
        "Reddit returned success without a diggable post id — not marking published. Stay queued.",
    };
  }
  const url = digString(result.data, ["url", "permalink"]);
  return {
    status: "ok",
    platform,
    providerPostId: postId,
    providerUrl: url
      ? url.startsWith("http")
        ? url
        : `https://www.reddit.com${url}`
      : null,
    raw: result.data,
  };
}
