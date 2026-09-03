/**
 * Supermemory connector — persistent brand / agent memory.
 *
 * Live when SUPERMEMORY_API_KEY is set:
 * - POST /v3/documents  — ingest docs (async process)
 * - POST /v4/memories   — instant structured facts (preferred for brand voice)
 * - POST /v4/search     — hybrid / memories search
 * - POST /v4/profile    — static + dynamic profile + search
 *
 * Offline: missing key → ok:false, empty results (never throws).
 * Canonical Founder Score stays in local JSON/Postgres — Supermemory is brand memory.
 */

const SM_BASE = "https://api.supermemory.ai";

export type SmAddResult = {
  ok: boolean;
  id?: string;
  documentId?: string;
  memories?: Array<{ id: string; memory: string }>;
  error?: string;
  offline?: boolean;
};

export type SmSearchHit = {
  id: string;
  text: string;
  similarity?: number;
  kind: "memory" | "chunk";
  metadata?: Record<string, unknown>;
};

export type SmSearchResult = {
  ok: boolean;
  hits: SmSearchHit[];
  total: number;
  timing?: number;
  error?: string;
  offline?: boolean;
};

export type SmProfileResult = {
  ok: boolean;
  staticFacts: string[];
  dynamicFacts: string[];
  searchHits: SmSearchHit[];
  error?: string;
  offline?: boolean;
};

function apiKey(): string | null {
  return process.env.SUPERMEMORY_API_KEY?.trim() || null;
}

function headers(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Multi-tenant brand container.
 * Prefer brandContainerTag({ ownerId, brandSlug }) — name-only is legacy and unsafe for SaaS.
 */
export function brandContainerTag(
  brandSlugOrOpts:
    | string
    | { ownerId?: string; brandSlug?: string } = "thevibemarketing",
): string {
  if (typeof brandSlugOrOpts === "string") {
    // Legacy path — demo / single-tenant only. Prefer owner-scoped form.
    const safe = brandSlugOrOpts
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return `org_demo:brand_${safe || "fleet"}`;
  }

  const ownerRaw = (brandSlugOrOpts.ownerId || "anonymous").trim();
  const owner = ownerRaw
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 12)
    .toLowerCase() || "anon";
  const safe = (brandSlugOrOpts.brandSlug || "fleet")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `ws_${owner}:brand_${safe || "fleet"}`;
}

/** VC Brain / founder-scoped container (not marketing brand). */
export function founderContainerTag(founderId: string): string {
  const safe = founderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return `founder_${safe}`;
}

export function isSupermemoryConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * Instant facts via v4/memories (queryable immediately — best for brand voice).
 */
export async function addMemories(opts: {
  contents: string[];
  containerTag: string;
  metadata?: Record<string, string | number | boolean>;
  isStatic?: boolean;
}): Promise<SmAddResult> {
  const key = apiKey();
  if (!key) {
    return { ok: false, offline: true, error: "SUPERMEMORY_API_KEY unset" };
  }
  const memories = opts.contents
    .map((c) => c.trim())
    .filter(Boolean)
    .map((content) => ({
      content,
      isStatic: opts.isStatic ?? true,
      metadata: opts.metadata ?? {},
    }));
  if (memories.length === 0) {
    return { ok: false, error: "No memory content" };
  }

  try {
    const res = await fetch(`${SM_BASE}/v4/memories`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        memories,
        containerTag: opts.containerTag,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Supermemory memories HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      documentId?: string;
      memories?: Array<{ id: string; memory: string }>;
    };
    return {
      ok: true,
      documentId: body.documentId,
      memories: body.memories?.map((m) => ({ id: m.id, memory: m.memory })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Supermemory addMemories failed",
    };
  }
}

/**
 * Document ingest (async processing). Use for longer markdown / Firecrawl dumps.
 */
export async function addDocument(opts: {
  content: string;
  containerTag: string;
  customId?: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SmAddResult> {
  const key = apiKey();
  if (!key) {
    return { ok: false, offline: true, error: "SUPERMEMORY_API_KEY unset" };
  }
  const content = opts.content.trim();
  if (!content) return { ok: false, error: "Empty content" };

  try {
    const res = await fetch(`${SM_BASE}/v3/documents`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        content,
        containerTag: opts.containerTag,
        ...(opts.customId ? { customId: opts.customId } : {}),
        metadata: opts.metadata ?? {},
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Supermemory documents HTTP ${res.status}` };
    }
    const body = (await res.json()) as { id?: string; status?: string };
    return { ok: true, id: body.id, documentId: body.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Supermemory addDocument failed",
    };
  }
}

export async function searchMemories(opts: {
  q: string;
  containerTag: string;
  limit?: number;
  searchMode?: "hybrid" | "memories";
}): Promise<SmSearchResult> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      hits: [],
      total: 0,
      offline: true,
      error: "SUPERMEMORY_API_KEY unset",
    };
  }
  const q = opts.q.trim();
  if (!q) {
    return { ok: false, hits: [], total: 0, error: "Empty query" };
  }

  try {
    const res = await fetch(`${SM_BASE}/v4/search`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        q,
        containerTag: opts.containerTag,
        limit: opts.limit ?? 5,
        searchMode: opts.searchMode ?? "hybrid",
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        hits: [],
        total: 0,
        error: `Supermemory search HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      results?: Array<{
        id?: string;
        memory?: string;
        chunk?: string;
        similarity?: number;
        metadata?: Record<string, unknown>;
      }>;
      total?: number;
      timing?: number;
    };
    const hits: SmSearchHit[] = (body.results ?? []).map((r, i) => ({
      id: r.id || `hit_${i}`,
      text: (r.memory || r.chunk || "").trim(),
      similarity: r.similarity,
      kind: r.memory ? "memory" : "chunk",
      metadata: r.metadata,
    }));
    return {
      ok: true,
      hits: hits.filter((h) => h.text),
      total: body.total ?? hits.length,
      timing: body.timing,
    };
  } catch (e) {
    return {
      ok: false,
      hits: [],
      total: 0,
      error: e instanceof Error ? e.message : "Supermemory search failed",
    };
  }
}

export async function getProfile(opts: {
  containerTag: string;
  q?: string;
}): Promise<SmProfileResult> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      staticFacts: [],
      dynamicFacts: [],
      searchHits: [],
      offline: true,
      error: "SUPERMEMORY_API_KEY unset",
    };
  }

  try {
    const res = await fetch(`${SM_BASE}/v4/profile`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        containerTag: opts.containerTag,
        ...(opts.q?.trim() ? { q: opts.q.trim() } : {}),
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        staticFacts: [],
        dynamicFacts: [],
        searchHits: [],
        error: `Supermemory profile HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      profile?: { static?: string[]; dynamic?: string[] };
      searchResults?: {
        results?: Array<{
          id?: string;
          memory?: string;
          chunk?: string;
          similarity?: number;
          metadata?: Record<string, unknown>;
        }>;
      };
    };
    const searchHits: SmSearchHit[] = (body.searchResults?.results ?? []).map(
      (r, i) => ({
        id: r.id || `p_${i}`,
        text: (r.memory || r.chunk || "").trim(),
        similarity: r.similarity,
        kind: r.memory ? ("memory" as const) : ("chunk" as const),
        metadata: r.metadata,
      }),
    );
    return {
      ok: true,
      staticFacts: body.profile?.static ?? [],
      dynamicFacts: body.profile?.dynamic ?? [],
      searchHits: searchHits.filter((h) => h.text),
    };
  } catch (e) {
    return {
      ok: false,
      staticFacts: [],
      dynamicFacts: [],
      searchHits: [],
      error: e instanceof Error ? e.message : "Supermemory profile failed",
    };
  }
}
