/**
 * Brand memory — multi-tenant, layered, task-aware.
 *
 * Architecture:
 * - SoT: structured BrandContext in app DB (marketing_state)
 * - Retrieval: Supermemory container scoped to workspace owner + brand
 * - Layers: core (always) · semantic (static SM facts + site doc) · episodic (HITL learnings)
 *
 * See hack/project files/BRAND-MEMORY.md
 */

import {
  addDocument,
  addMemories,
  brandContainerTag,
  getProfile,
  isSupermemoryConfigured,
  searchMemories,
  type SmProfileResult,
  type SmSearchResult,
} from "../connectors/supermemory";

/** What the agent is about to do — changes recall query + assembly. */
export type BrandRecallTask =
  | "general"
  | "draft_x"
  | "draft_linkedin"
  | "draft_reddit"
  | "campaign"
  | "reject_review";

export type BrandMemoryInput = {
  url: string;
  name: string;
  oneliner: string;
  icp: string;
  tone: string;
  pillars: string[];
  /** Optional hard constraints (never claim X, never spam, etc.). */
  never_say?: string[];
  /** Optional audience / positioning notes. */
  audience_notes?: string | null;
  /** Evidence-backed claims. Only verified facts are injected as durable truth. */
  facts?: BrandFact[];
  /** Optional Firecrawl markdown dump for deeper document ingest. */
  markdown?: string | null;
};

export type BrandFactStatus = "pending" | "verified" | "rejected";

export type BrandFact = {
  id: string;
  label: string;
  value: string;
  source: "firecrawl" | "tavily" | "human" | "system";
  evidence_url?: string | null;
  confidence?: number | null;
  status: BrandFactStatus;
  note?: string | null;
  verified_at?: string | null;
};

export type BrandSyncResult = {
  configured: boolean;
  containerTag: string;
  factsOk: boolean;
  documentOk: boolean;
  factCount: number;
  documentId?: string;
  layers: { core: number; semantic: number };
  error?: string;
};

export type BrandEpisodeKind =
  | "reject"
  | "approve"
  | "publish"
  | "user_note"
  | "channel_note";

export type BrandEpisodeResult = {
  configured: boolean;
  containerTag: string;
  ok: boolean;
  error?: string;
};

export type BrandRecallResult = {
  /** The retrieval provider has credentials configured. */
  configured: boolean;
  /** At least one live retrieval request completed successfully. */
  live: boolean;
  containerTag: string;
  task: BrandRecallTask;
  profile: SmProfileResult;
  search: SmSearchResult;
  /** Core structured lines always present when brand provided. */
  coreLines: string[];
  /** Ranked lines for prompt injection (core first, then retrieval). */
  contextLines: string[];
  /** Debug / UI: which layers contributed. */
  layers: {
    core: number;
    static: number;
    dynamic: number;
    search: number;
  };
};

/** @deprecated use brandContainerForWorkspace — name-only is demo/legacy (org_demo:). */
export function containerForBrand(name: string): string {
  // String overload keeps org_demo: prefix for old call sites / demos.
  return brandContainerTag(name || "unknown");
}

export function brandContainerForWorkspace(
  ownerId: string,
  brandName: string,
): string {
  return brandContainerTag({
    ownerId: ownerId || "anonymous",
    brandSlug: brandName || "unknown",
  });
}

export { isSupermemoryConfigured };

/** Normalize brand name → slug for tags / customIds. */
export function brandSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "brand"
  );
}

/**
 * Core memory block — always assembled from structured brand (SoT).
 * Not optional vector noise; these lines anchor every draft.
 */
export function buildCoreBrandLines(brand: BrandMemoryInput): string[] {
  const pillars =
    brand.pillars.filter(Boolean).join(" · ") || "(no pillars set)";
  const lines = [
    `[identity] ${brand.name.trim()}: ${brand.oneliner.trim()}`,
    `[site] ${brand.url.trim()}`,
    `[icp] ${brand.icp.trim()}`,
    `[voice] ${brand.tone.trim()}`,
    `[pillars] ${pillars}`,
    `[rule] Never invent metrics, customers, or integrations not in brand memory.`,
    `[rule] Prefer helpful founder-channel tone over hard sell.`,
  ];
  if (brand.audience_notes?.trim()) {
    lines.push(`[audience] ${brand.audience_notes.trim()}`);
  }
  for (const n of brand.never_say ?? []) {
    if (n.trim()) lines.push(`[never] ${n.trim()}`);
  }
  for (const fact of brand.facts ?? []) {
    if (fact.status === "verified" && fact.label.trim() && fact.value.trim()) {
      lines.push(`[verified:${fact.label.trim()}] ${fact.value.trim()}`);
    }
  }
  return lines;
}

/** Semantic static facts written to SuperMemory (idempotent by metadata.fact_key). */
export function buildSemanticFactPayload(brand: BrandMemoryInput): Array<{
  key: string;
  content: string;
  isStatic: boolean;
}> {
  const slug = brandSlug(brand.name);
  const pillars = brand.pillars.filter(Boolean).join(", ") || "distribution";
  const facts: Array<{ key: string; content: string; isStatic: boolean }> = [
    {
      key: `${slug}:identity`,
      content: `Brand identity — name: ${brand.name}. One-liner: ${brand.oneliner}. Site: ${brand.url}.`,
      isStatic: true,
    },
    {
      key: `${slug}:icp`,
      content: `ICP for ${brand.name}: ${brand.icp}. Write only for this audience.`,
      isStatic: true,
    },
    {
      key: `${slug}:voice`,
      content: `Brand voice for ${brand.name}: ${brand.tone}. Never write off-brand.`,
      isStatic: true,
    },
    {
      key: `${slug}:pillars`,
      content: `Content pillars for ${brand.name}: ${pillars}.`,
      isStatic: true,
    },
    {
      key: `${slug}:ops`,
      content: `${brand.name} uses vibemarketer agent fleet with HITL autonomy (L1 default). Do not claim posts are published without a provider post id.`,
      isStatic: true,
    },
  ];
  if (brand.audience_notes?.trim()) {
    facts.push({
      key: `${slug}:audience`,
      content: `Audience notes for ${brand.name}: ${brand.audience_notes.trim()}`,
      isStatic: true,
    });
  }
  (brand.never_say ?? []).forEach((n, i) => {
    if (n.trim()) {
      facts.push({
        key: `${slug}:never_${i}`,
        content: `Never say / never claim for ${brand.name}: ${n.trim()}`,
        isStatic: true,
      });
    }
  });
  (brand.facts ?? [])
    .filter((fact) => fact.status === "verified")
    .slice(0, 24)
    .forEach((fact) => {
      facts.push({
        key: `${slug}:verified:${brandSlug(fact.label)}:${fact.id.slice(0, 12)}`,
        content: `Verified brand fact for ${brand.name} — ${fact.label}: ${fact.value}${
          fact.evidence_url ? ` Evidence: ${fact.evidence_url}` : ""
        }`,
        isStatic: true,
      });
    });
  return facts;
}

export function taskSearchQuery(task: BrandRecallTask, brandName: string): string {
  switch (task) {
    case "draft_x":
      return `${brandName} voice tone short posts hooks ICP pillars never say`;
    case "draft_linkedin":
      return `${brandName} professional voice ICP pillars founder story B2B positioning`;
    case "draft_reddit":
      return `${brandName} helpful community tone ICP pain points no hard sell never say`;
    case "campaign":
      return `${brandName} ICP pillars positioning campaign themes channel mix`;
    case "reject_review":
      return `${brandName} reject feedback never say voice corrections`;
    default:
      return `${brandName} brand tone voice ICP pillars positioning never say`;
  }
}

function dedupeLines(lines: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase().replace(/\s+/g, " ").slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Push brand facts (+ optional scrape markdown) into Supermemory for this workspace. */
export async function syncBrandMemory(
  brand: BrandMemoryInput,
  opts?: { ownerId?: string },
): Promise<BrandSyncResult> {
  const ownerId = opts?.ownerId?.trim() || "anonymous";
  const containerTag = brandContainerForWorkspace(ownerId, brand.name);

  if (!isSupermemoryConfigured()) {
    return {
      configured: false,
      containerTag,
      factsOk: false,
      documentOk: false,
      factCount: 0,
      layers: { core: buildCoreBrandLines(brand).length, semantic: 0 },
      error: "SUPERMEMORY_API_KEY unset — structured brand only (no retrieval index)",
    };
  }

  const semantic = buildSemanticFactPayload(brand);
  const mem = await addMemories({
    contents: semantic.map((f) => f.content),
    containerTag,
    metadata: {
      source: "brand_sync",
      kind: "semantic_core",
      brand: brand.name,
      owner: ownerId.slice(0, 36),
      // fact keys joined for debugging (API is bulk; keys live in content prefix)
      fact_keys: semantic.map((f) => f.key).join("|").slice(0, 200),
    },
    isStatic: true,
  });

  let documentOk = false;
  let documentId: string | undefined;
  if (brand.markdown && brand.markdown.trim().length > 80) {
    const slug = brandSlug(brand.name);
    const doc = await addDocument({
      content: brand.markdown.slice(0, 24_000),
      containerTag,
      customId: `brand_site_${ownerId.slice(0, 12)}_${slug}`.slice(0, 64),
      metadata: {
        source: "firecrawl",
        kind: "brand_site",
        brand: brand.name,
        layer: "semantic",
      },
    });
    documentOk = doc.ok;
    documentId = doc.documentId || doc.id;
  }

  return {
    configured: true,
    containerTag,
    factsOk: mem.ok,
    documentOk,
    factCount: mem.memories?.length ?? semantic.length,
    documentId,
    layers: {
      core: buildCoreBrandLines(brand).length,
      semantic: semantic.length,
    },
    error: mem.ok ? undefined : mem.error,
  };
}

/**
 * Episodic write — HITL reject/approve/publish learnings (dynamic, not static).
 * Improves future drafts without overwriting core identity.
 */
export async function writeBrandEpisode(opts: {
  ownerId: string;
  brandName: string;
  kind: BrandEpisodeKind;
  text: string;
  platform?: string;
}): Promise<BrandEpisodeResult> {
  const containerTag = brandContainerForWorkspace(opts.ownerId, opts.brandName);
  const text = opts.text.trim();
  if (!text) {
    return {
      configured: isSupermemoryConfigured(),
      containerTag,
      ok: false,
      error: "empty episode text",
    };
  }

  if (!isSupermemoryConfigured()) {
    return {
      configured: false,
      containerTag,
      ok: false,
      error: "SUPERMEMORY_API_KEY unset",
    };
  }

  const platform = opts.platform ? ` platform=${opts.platform}` : "";
  const content = `[episode:${opts.kind}${platform}] ${text}`.slice(0, 2000);

  const mem = await addMemories({
    contents: [content],
    containerTag,
    metadata: {
      source: "hitl",
      kind: opts.kind,
      layer: "episodic",
      brand: opts.brandName,
      ...(opts.platform ? { platform: opts.platform } : {}),
    },
    isStatic: false,
  });

  return {
    configured: true,
    containerTag,
    ok: mem.ok,
    error: mem.ok ? undefined : mem.error,
  };
}

/**
 * Recall brand context for drafts / agents.
 * Always prefixes structured core when `brand` is provided (SoT).
 */
export async function recallBrandMemory(opts: {
  brandName: string;
  ownerId?: string;
  /** Prefer passing full brand so core lines are always correct. */
  brand?: BrandMemoryInput | null;
  q?: string;
  task?: BrandRecallTask;
  limit?: number;
}): Promise<BrandRecallResult> {
  const ownerId = opts.ownerId?.trim() || "anonymous";
  const containerTag = brandContainerForWorkspace(ownerId, opts.brandName);
  const task = opts.task ?? "general";
  const limit = opts.limit ?? 16;

  const coreLines = opts.brand
    ? buildCoreBrandLines(opts.brand)
    : [`[identity] ${opts.brandName}`];

  const q =
    opts.q?.trim() ||
    taskSearchQuery(task, opts.brandName);

  if (!isSupermemoryConfigured()) {
    return {
      configured: false,
      live: false,
      containerTag,
      task,
      profile: {
        ok: false,
        staticFacts: [],
        dynamicFacts: [],
        searchHits: [],
        offline: true,
      },
      search: {
        ok: false,
        hits: [],
        total: 0,
        offline: true,
      },
      coreLines,
      // Offline: still return core so drafts can use structured brand
      contextLines: coreLines.slice(0, limit),
      layers: {
        core: coreLines.length,
        static: 0,
        dynamic: 0,
        search: 0,
      },
    };
  }

  const [profile, search] = await Promise.all([
    getProfile({ containerTag, q }),
    searchMemories({ q, containerTag, limit: 8, searchMode: "hybrid" }),
  ]);

  // Prefer episodic (dynamic) when reviewing rejections; else balance.
  const dynamicFirst =
    task === "reject_review" || task === "draft_reddit";

  const retrieved = dynamicFirst
    ? [
        ...profile.dynamicFacts,
        ...profile.staticFacts,
        ...search.hits.map((h) => h.text),
      ]
    : [
        ...profile.staticFacts,
        ...profile.dynamicFacts,
        ...search.hits.map((h) => h.text),
      ];

  const contextLines = dedupeLines([...coreLines, ...retrieved], limit);
  const live = profile.ok || search.ok;

  return {
    configured: true,
    live,
    containerTag,
    task,
    profile,
    search,
    coreLines,
    contextLines,
    layers: {
      core: coreLines.length,
      static: profile.staticFacts.length,
      dynamic: profile.dynamicFacts.length,
      search: search.hits.length,
    },
  };
}
