import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writableDataPath } from "./paths";
import { getSupabaseAdmin, hasSupabaseAdmin } from "./supabase-admin";
import { getWorkspaceOwnerId } from "./workspace-context";
import type { BrandFact } from "@vibe/engine";

/**
 * Marketing fleet persistence.
 *
 * Architecture (startup product, not OSS local-first):
 * - Production / Vercel: Supabase `marketing_state` is the ONLY source of truth.
 * - Missing row = new workspace (empty). Not an error. Not a reason to read disk.
 * - Supabase query/write failure = fail closed (throw → API 503). Never silent local fallback.
 * - Local JSON only when MARKETING_STORE_BACKEND=local (unit tests / offline laptop without keys).
 *
 * Do not reintroduce "hydrate from /tmp when Supabase misses" — that hides broken migrations
 * and multi-instance data loss in a real multi-tenant SaaS.
 */

export type Platform = "x" | "linkedin" | "reddit";
export type DistributionPlatform =
  | Platform
  | "hacker_news"
  | "website"
  | "email";
export type ContentType =
  | "social_post"
  | "reddit_reply"
  | "hn_comment"
  | "blog_article"
  | "email"
  | "newsletter";
export type PublishablePlatform = Platform;
export type PostStatus =
  | "pending"
  | "approved"
  | "queued"
  | "rejected"
  | "published";
export type AutonomyLevel = "L1" | "L2" | "L3";
export const L3_BLOCKED_NOTE = "L3 blocked — connect Composio account";

export type BrandContext = {
  url: string;
  name: string;
  oneliner: string;
  icp: string;
  tone: string;
  pillars: string[];
  /** Hard constraints for agents (never invent X, never spam). */
  never_say?: string[];
  /** Extra audience / positioning notes. */
  audience_notes?: string | null;
  /** Competitor domains/names for CMO dashboard. */
  competitors?: string[];
  /** Free-form product blurb (CMO overview). */
  description?: string | null;
  /** Evidence-backed brand facts. Pending facts require HITL before prompt truth. */
  facts?: BrandFact[];
  /** Last SuperMemory sync metadata (retrieval index, not SoT). */
  memory?: {
    container_tag: string;
    last_synced_at: string;
    fact_count: number;
  } | null;
  /** Cached site audit snapshot (ISO time + scores). */
  last_audit?: {
    at: string;
    overall: number;
    seo: number;
    geo: number;
    url: string;
  } | null;
  updated_at: string;
};

export type Post = {
  id: string;
  platform: DistributionPlatform;
  content_type?: ContentType;
  title?: string | null;
  body: string;
  status: PostStatus;
  autonomy: AutonomyLevel;
  created_at: string;
  brand: string;
  rationale: string;
  note?: string;
  /** Optional creative (Grok Imagine URL or temporary CDN). Not a publish claim. */
  media_url?: string | null;
  /** Set only after a live provider returns a post id (Composio etc.). */
  provider_post_id?: string | null;
  provider_url?: string | null;
  published_at?: string | null;
};

export type LoopType = "daily_distribution" | "opportunity" | "content-draft";

export type LoopRun = {
  id: string;
  name: LoopType | string;
  started_at: string;
  finished_at?: string;
  status: "running" | "done" | "failed";
  posts_created?: number;
  note?: string;
};

export type PublishLog = {
  id: string;
  post_id: string;
  platform: DistributionPlatform;
  at: string;
  via: "hitl_approve" | "l2_auto" | "l3_auto";
  /** Internal queue activity or a provider-confirmed external execution. */
  actor: "approval_queue" | "provider_confirmation";
  note: string;
};

export type CampaignDay = {
  day: number;
  channel: Platform | "email" | "blog";
  goal: string;
  draft_hint: string;
};

/** Seven-day campaign brief — planning artifact; drafts still go through HITL. */
export type CampaignBrief = {
  id: string;
  title: string;
  created_at: string;
  audience: string;
  days: CampaignDay[];
  note: string;
};

/** Monthly LLM/scrape usage for run meters (period = YYYY-MM UTC). */
export type UsageMeter = {
  period: string;
  generations: number;
  by_kind: Record<string, number>;
  updated_at: string;
};

export type MarketingData = {
  /** In-document version (mirrors row version for clients/debugging). */
  version: number;
  brand: BrandContext | null;
  posts: Post[];
  loops: LoopRun[];
  /**
   * Fleet autonomy:
   * L1 — all drafts pending HITL; approve → queued (not published until provider confirms)
   * L2 — low-risk (X/LinkedIn) social drafts auto-queue after generate; reddit/opportunity stay pending
   * L3 — blocked: queuePost(l3_auto) forces pending until live auto-publish is implemented
   */
  autonomy: AutonomyLevel;
  publish_log: PublishLog[];
  campaign?: CampaignBrief | null;
  /** Soft/hard generation meters — never unlimited LLM. */
  usage?: UsageMeter | null;
};

export class MarketingStoreError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAVAILABLE"
      | "CONFLICT"
      | "UNAUTHORIZED"
      | "MISCONFIGURED"
      | "INVALID_TRANSITION"
      | "POST_IMMUTABLE"
      | "POST_NOT_FOUND"
      | "POST_PROVIDER_ID_REQUIRED"
      | "POST_PROVIDER_ID_INVALID"
      | "POST_PROVIDER_CONFLICT"
      | "OUTCOME_UNKNOWN",
    public readonly status: number = 503,
  ) {
    super(message);
    this.name = "MarketingStoreError";
  }
}

export const POST_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  pending: ["queued", "rejected"],
  approved: [],
  queued: ["pending", "published"],
  rejected: ["pending"],
  published: [],
};

export function canTransitionPostStatus(
  from: PostStatus,
  to: PostStatus,
): boolean {
  if (to === from) return true;
  return POST_TRANSITIONS[from]?.includes(to) === true;
}

export function assertPostTransition(
  from: PostStatus,
  to: PostStatus,
): void {
  if (to === from) return;
  if (canTransitionPostStatus(from, to)) return;
  throw new MarketingStoreError(
    `Invalid post transition ${from} -> ${to}`,
    "INVALID_TRANSITION",
    409,
  );
}

export function assertPostEditable(post: Post): void {
  if (post.status !== "pending") {
    if (post.status === "published") {
      throw new MarketingStoreError(
        "Published posts are immutable.",
        "POST_IMMUTABLE",
        409,
      );
    }
    throw new MarketingStoreError(
      `Post is not editable in status ${post.status}.`,
      "POST_IMMUTABLE",
      409,
    );
  }
}

function emptyData(): MarketingData {
  return {
    version: 0,
    brand: null,
    posts: [],
    loops: [],
    autonomy: "L1",
    publish_log: [],
    campaign: null,
    usage: null,
  };
}

export function currentUsagePeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function coerceUsage(raw: unknown): UsageMeter | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const period = typeof o.period === "string" ? o.period : "";
  const generations =
    typeof o.generations === "number" && Number.isFinite(o.generations)
      ? Math.max(0, Math.floor(o.generations))
      : 0;
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const by_kind: Record<string, number> = {};
  if (o.by_kind && typeof o.by_kind === "object") {
    for (const [k, v] of Object.entries(o.by_kind as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        by_kind[k.slice(0, 48)] = Math.floor(v);
      }
    }
  }
  return {
    period,
    generations,
    by_kind,
    updated_at:
      typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
  };
}

/** Low-risk channels eligible for L2 auto-approve. */
export function isLowRiskPlatform(platform: DistributionPlatform): boolean {
  return platform === "x" || platform === "linkedin";
}

export function isPublishablePlatform(
  platform: DistributionPlatform,
): platform is PublishablePlatform {
  return platform === "x" || platform === "linkedin" || platform === "reddit";
}

function nowIso(): string {
  return new Date().toISOString();
}

function coerceMarketingData(
  parsed: Partial<MarketingData> | null | undefined,
): MarketingData {
  const autonomy =
    parsed?.autonomy === "L1" ||
    parsed?.autonomy === "L2" ||
    parsed?.autonomy === "L3"
      ? parsed.autonomy
      : "L1";
  const posts = Array.isArray(parsed?.posts)
    ? parsed.posts.filter(
        (p): p is Post =>
          Boolean(
            p &&
              typeof p === "object" &&
              typeof p.id === "string" &&
              typeof p.body === "string" &&
              (p.platform === "x" ||
                p.platform === "linkedin" ||
                p.platform === "reddit" ||
                p.platform === "hacker_news" ||
                p.platform === "website" ||
                p.platform === "email"),
          ),
      )
    : [];
  const loops = Array.isArray(parsed?.loops)
    ? parsed.loops.filter(
        (l): l is LoopRun =>
          Boolean(
            l &&
              typeof l === "object" &&
              typeof l.id === "string" &&
              typeof l.started_at === "string",
          ),
      )
    : [];
  const publishLog = Array.isArray(parsed?.publish_log)
    ? parsed.publish_log.filter(
        (l): l is PublishLog =>
          Boolean(
            l &&
              typeof l === "object" &&
              typeof l.id === "string" &&
              typeof l.post_id === "string",
          ),
      )
    : [];
  const version =
    typeof parsed?.version === "number" &&
    Number.isFinite(parsed.version) &&
    parsed.version >= 0
      ? Math.floor(parsed.version)
      : 0;
  return {
    version,
    brand:
      parsed?.brand && typeof parsed.brand === "object" ? parsed.brand : null,
    posts: posts.slice(0, 5000),
    loops: loops.slice(0, 1000),
    autonomy,
    publish_log: publishLog.slice(0, 5000),
    campaign: parsed?.campaign ?? null,
    usage: coerceUsage(parsed?.usage),
  };
}

/**
 * Resolve backend.
 * - production/VERCEL: always supabase (hard fail if keys missing)
 * - MARKETING_STORE_BACKEND=local: file (tests / offline only)
 * - dev with Supabase keys: supabase
 * - dev without keys: local (explicit opt-out of cloud)
 */
export function resolveMarketingBackend(): "supabase" | "local" {
  const forced = process.env.MARKETING_STORE_BACKEND?.trim().toLowerCase();
  if (forced === "local") return "local";
  if (forced === "supabase") {
    if (!hasSupabaseAdmin()) {
      throw new MarketingStoreError(
        "MARKETING_STORE_BACKEND=supabase but SUPABASE_SERVICE_ROLE_KEY / URL are missing",
        "MISCONFIGURED",
        500,
      );
    }
    return "supabase";
  }

  const isProd =
    process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  if (isProd) {
    if (!hasSupabaseAdmin()) {
      throw new MarketingStoreError(
        "Production requires Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Local JSON is not a production store.",
        "MISCONFIGURED",
        500,
      );
    }
    return "supabase";
  }

  // Local development: prefer real Supabase when configured so you dogfood the SaaS path.
  if (hasSupabaseAdmin()) return "supabase";
  return "local";
}

export class MarketingStore {
  private data: MarketingData = emptyData();
  private loaded = false;
  /**
   * Whether current DB table exposes marketing_state.version.
   * When false, we keep compatibility with older schemas by falling back
   * to plain `data` reads/writes (best-effort CAS only in app memory).
   */
  private supportsVersion = true;
  /**
   * Row-level CAS token from marketing_state.version.
   * null = no row yet (first save inserts version 1).
   */
  private rowVersion: number | null = null;
  /** Serialize mutations per instance (same serverless worker). */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(
    public readonly path: string = writableDataPath("marketing.json"),
    public readonly ownerId: string = "anonymous",
  ) {}

  static fromDefault(): MarketingStore {
    const owner = getWorkspaceOwnerId()?.trim() || "anonymous";
    const safe = owner.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    return new MarketingStore(
      writableDataPath("marketing", `${safe}.json`),
      owner,
    );
  }

  private backend(): "supabase" | "local" {
    return resolveMarketingBackend();
  }

  private requireOwnerForCloud(): void {
    if (this.backend() === "supabase" && this.ownerId === "anonymous") {
      throw new MarketingStoreError(
        "Authenticated workspace required for marketing state",
        "UNAUTHORIZED",
        401,
      );
    }
  }

  private async loadLocal(): Promise<MarketingData> {
    try {
      const raw = await readFile(this.path, "utf8");
      return coerceMarketingData(JSON.parse(raw) as Partial<MarketingData>);
    } catch {
      return emptyData();
    }
  }

  private async writeLocal(data: MarketingData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.path);
    try {
      await unlink(tmp);
    } catch {
      /* path already replaced */
    }
  }

  async load(): Promise<MarketingData> {
    this.requireOwnerForCloud();
    const backend = this.backend();

    if (backend === "local") {
      this.data = await this.loadLocal();
      this.rowVersion = this.data.version > 0 ? this.data.version : null;
      this.loaded = true;
      return this.data;
    }

    // --- Supabase only (no disk fallback) ---
    const sb = getSupabaseAdmin();
    if (!sb) {
      throw new MarketingStoreError(
        "Supabase admin client unavailable",
        "MISCONFIGURED",
        500,
      );
    }

    const { data, error } = await sb
      .from("marketing_state")
      .select("data, version")
      .eq("owner_id", this.ownerId)
      .maybeSingle();

    if (error) {
      const msg = error.message?.toLowerCase() || "";
      const isMissingColumnVariant =
        error.code === "42703" ||
        msg.includes("marketing_state.version does not exist") ||
        msg.includes("column marketing_state.version does not exist") ||
        msg.includes("could not find the 'version' column") ||
        msg.includes("could not find the \"version\" column") ||
        msg.includes("column \"version\" does not exist") ||
        msg.includes("column 'version' does not exist");
      if (isMissingColumnVariant) {
        this.supportsVersion = false;
        const legacy = await sb
          .from("marketing_state")
          .select("data")
          .eq("owner_id", this.ownerId)
          .maybeSingle();
        if (legacy.error) {
          throw new MarketingStoreError(
            `Marketing state unavailable: ${legacy.error.message}. Apply migrations (marketing_state) and check service role.`,
            "UNAVAILABLE",
            503,
          );
        }
        if (!legacy.data) {
          this.data = emptyData();
          this.rowVersion = null;
          this.loaded = true;
          return this.data;
        }
        this.data = coerceMarketingData(legacy.data.data as Partial<MarketingData>);
        this.rowVersion = null;
        this.loaded = true;
        return this.data;
      }

      // Table missing, network, auth, etc. — fail closed so ops notices.
      throw new MarketingStoreError(
        `Marketing state unavailable: ${error.message}. Apply migrations (marketing_state) and check service role.`,
        "UNAVAILABLE",
        503,
      );
    }

    if (!data) {
      // First-time user: empty workspace. Not a miss to paper over.
      this.data = emptyData();
      this.rowVersion = null;
      this.loaded = true;
      return this.data;
    }

    this.supportsVersion = true;
    this.data = coerceMarketingData(data.data as Partial<MarketingData>);
    const colVersion =
      typeof data.version === "number" && Number.isFinite(data.version)
        ? data.version
        : this.data.version;
    this.rowVersion = colVersion;
    // Keep document version aligned with row CAS token.
    this.data.version = colVersion;
    this.loaded = true;
    return this.data;
  }

  async save(): Promise<void> {
    this.requireOwnerForCloud();
    const backend = this.backend();

    if (backend === "local") {
      this.data = {
        ...this.data,
        version: (this.data.version ?? 0) + 1,
      };
      this.rowVersion = this.data.version;
      await this.writeLocal(this.data);
      return;
    }

    const sb = getSupabaseAdmin();
    if (!sb) {
      throw new MarketingStoreError(
        "Supabase admin client unavailable",
        "MISCONFIGURED",
        500,
      );
    }

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const expected = this.rowVersion;
      const nextVersion = (expected ?? 0) + 1;
      const payload: MarketingData = {
        ...this.data,
        version: nextVersion,
      };
      const updatedAt = nowIso();

      if (!this.supportsVersion) {
        const { error } = await sb.from("marketing_state").upsert({
          owner_id: this.ownerId,
          data: payload,
          updated_at: updatedAt,
        }, {
          onConflict: "owner_id",
        });

        if (error) {
          throw new MarketingStoreError(
            `Marketing state save failed: ${error.message}`,
            "UNAVAILABLE",
            503,
          );
        }

        this.data = payload;
        this.rowVersion = null;
        return;
      }

      if (expected === null) {
        // First write: insert. Unique violation → concurrent first write; reload + retry.
        const { error } = await sb.from("marketing_state").insert({
          owner_id: this.ownerId,
          data: payload,
          version: nextVersion,
          updated_at: updatedAt,
        });
        if (!error) {
          this.data = payload;
          this.rowVersion = nextVersion;
          return;
        }
        // 23505 unique_violation or PostgREST duplicate
        if (
          error.code === "23505" ||
          /duplicate|unique/i.test(error.message)
        ) {
          await this.load();
          continue;
        }
        throw new MarketingStoreError(
          `Marketing state save failed: ${error.message}`,
          "UNAVAILABLE",
          503,
        );
      }

      // CAS update: only succeed if row version still matches what we loaded.
      const { data: updated, error } = await sb
        .from("marketing_state")
        .update({
          data: payload,
          version: nextVersion,
          updated_at: updatedAt,
        })
        .eq("owner_id", this.ownerId)
        .eq("version", expected)
        .select("version")
        .maybeSingle();

      if (error) {
        throw new MarketingStoreError(
          `Marketing state save failed: ${error.message}`,
          "UNAVAILABLE",
          503,
        );
      }

      if (updated) {
        this.data = payload;
        this.rowVersion = nextVersion;
        return;
      }

      // 0 rows: lost the race — reload and retry (caller mutation already applied in memory;
      // for true multi-field merge we'd re-apply. Serial runExclusive + CAS covers most cases.)
      if (attempt < maxAttempts - 1) {
        const snapshot = this.data;
        await this.load();
        // Re-apply in-memory fields that the mutation just set (brand/posts/etc.)
        // by preferring snapshot's non-version fields over reloaded when snapshot is newer intent.
        // Safe approach: take snapshot posts/loops/logs as the mutation's intended full doc,
        // but start CAS from latest rowVersion.
        this.data = {
          ...snapshot,
          version: this.rowVersion ?? 0,
        };
        continue;
      }

      throw new MarketingStoreError(
        "Marketing state conflict: concurrent update. Retry the request.",
        "CONFLICT",
        409,
      );
    }
  }

  private async ensure(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  /**
   * Run a mutation serially for this owner (same instance).
   * Always re-reads from Supabase before mutating so multi-instance CAS has a fresh token.
   */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(async () => {
      if (this.backend() === "supabase") {
        this.loaded = false;
        await this.load();
      }
      return fn();
    }, async () => {
      if (this.backend() === "supabase") {
        this.loaded = false;
        await this.load();
      }
      return fn();
    });
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getBrand(): Promise<BrandContext | null> {
    await this.ensure();
    return this.data.brand;
  }

  async setBrand(
    brand: Omit<BrandContext, "updated_at"> & { updated_at?: string },
  ): Promise<BrandContext> {
    return this.runExclusive(async () => {
      await this.ensure();
      const neverSay = Array.isArray(brand.never_say)
        ? brand.never_say.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20)
        : this.data.brand?.never_say;
      const competitors = Array.isArray(brand.competitors)
        ? brand.competitors
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20)
        : this.data.brand?.competitors;
      const facts = Array.isArray(brand.facts)
        ? brand.facts
            .filter(
              (f): f is BrandFact =>
                Boolean(
                  f &&
                    typeof f === "object" &&
                    typeof f.id === "string" &&
                    typeof f.label === "string" &&
                    typeof f.value === "string",
                ),
            )
            .slice(0, 80)
        : this.data.brand?.facts;
      const next: BrandContext = {
        url: brand.url,
        name: brand.name,
        oneliner: brand.oneliner,
        icp: brand.icp,
        tone: brand.tone,
        pillars: brand.pillars,
        never_say: neverSay?.length ? neverSay : undefined,
        audience_notes:
          brand.audience_notes !== undefined
            ? brand.audience_notes
            : this.data.brand?.audience_notes ?? null,
        competitors: competitors?.length ? competitors : undefined,
        description:
          brand.description !== undefined
            ? brand.description
            : this.data.brand?.description ?? null,
        facts: facts?.length ? facts : undefined,
        memory:
          brand.memory !== undefined
            ? brand.memory
            : this.data.brand?.memory ?? null,
        last_audit:
          brand.last_audit !== undefined
            ? brand.last_audit
            : this.data.brand?.last_audit ?? null,
        updated_at: brand.updated_at ?? nowIso(),
      };
      this.data.brand = next;
      await this.save();
      return next;
    });
  }

  /** Patch brand memory metadata after SuperMemory sync without rewriting voice fields. */
  async setBrandMemoryMeta(meta: NonNullable<BrandContext["memory"]>): Promise<BrandContext | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      if (!this.data.brand) return null;
      this.data.brand = {
        ...this.data.brand,
        memory: meta,
        updated_at: nowIso(),
      };
      await this.save();
      return this.data.brand;
    });
  }

  async setBrandFacts(facts: BrandFact[]): Promise<BrandContext | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      if (!this.data.brand) return null;
      this.data.brand = {
        ...this.data.brand,
        facts: facts.slice(0, 80),
        updated_at: nowIso(),
      };
      await this.save();
      return this.data.brand;
    });
  }

  async listPosts(status?: PostStatus): Promise<Post[]> {
    await this.ensure();
    const posts = [...this.data.posts].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    if (!status) return posts;
    return posts.filter((p) => p.status === status);
  }

  async listPending(): Promise<Post[]> {
    return this.listPosts("pending");
  }

  async upsertPost(
    post: Partial<Post> & { platform: DistributionPlatform; body: string },
  ): Promise<Post> {
    return this.runExclusive(async () => {
      await this.ensure();
      const brandSlug =
        post.brand ??
        this.data.brand?.name?.toLowerCase().replace(/\s+/g, "") ??
        "vibemarketer";

      if (post.id) {
        const idx = this.data.posts.findIndex((p) => p.id === post.id);
        if (idx >= 0) {
          const existing = this.data.posts[idx];
          assertPostEditable(existing);
          if (post.status !== undefined && post.status !== existing.status) {
            assertPostTransition(existing.status, post.status);
          }
          const nextBody = post.body !== undefined ? String(post.body) : existing.body;
          const merged: Post = {
            ...existing,
            title:
              post.title !== undefined ? post.title ?? null : existing.title,
            body: nextBody,
            rationale:
              post.rationale !== undefined
                ? post.rationale
                : existing.rationale,
            note: post.note !== undefined ? post.note : existing.note,
            media_url:
              post.media_url !== undefined ? post.media_url : existing.media_url,
            brand: existing.brand,
          };
          if (post.autonomy) merged.autonomy = post.autonomy;
          this.data.posts[idx] = merged;
          await this.save();
          return merged;
        }
      }

      if (post.status && post.status !== "pending") {
        throw new MarketingStoreError(
          `New posts can only be created as pending. Received ${post.status}.`,
          "INVALID_TRANSITION",
          400,
        );
      }

      const created: Post = {
        id: post.id ?? `mp_${randomUUID().slice(0, 8)}`,
        platform: post.platform,
        content_type: post.content_type ?? "social_post",
        title: post.title ?? null,
        body: post.body,
        status: post.status ?? "pending",
        autonomy: post.autonomy ?? "L1",
        created_at: post.created_at ?? nowIso(),
        brand: brandSlug,
        rationale: post.rationale ?? "Manual draft",
        note: post.note,
        media_url: post.media_url ?? null,
      };
      this.data.posts.unshift(created);
      await this.save();
      return created;
    });
  }

  async approvePost(id: string): Promise<Post | null> {
    return this.queuePost(id, "hitl_approve");
  }

  /**
   * HITL approve → internal queue only.
   * Never marks `published` here — call `confirmPublished` after Composio (etc.) returns an id.
   */
  async queuePost(
    id: string,
    via: PublishLog["via"],
  ): Promise<Post | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      const post = this.data.posts.find((p) => p.id === id);
      if (!post) return null;
      if (post.status === "queued") {
        return post;
      }
      if (post.status === "published") {
        throw new MarketingStoreError(
          "Published posts are immutable.",
          "POST_IMMUTABLE",
          409,
        );
      }
      if (via === "l3_auto") {
        assertPostTransition(post.status, "pending");
        post.status = "pending";
        post.note = L3_BLOCKED_NOTE;
        await this.save();
        return post;
      }
      assertPostTransition(post.status, "queued");
      post.status = "queued";
      post.note =
        post.note ??
        `Queued internally (not published) → ${post.platform}. A connected provider must confirm a post ID and URL.`;
      const log: PublishLog = {
        id: `pub_${randomUUID().slice(0, 8)}`,
        post_id: post.id,
        platform: post.platform,
        at: nowIso(),
        via,
        actor: "approval_queue",
        note: `Queued internally (not published) → ${post.platform}. A connected provider must confirm a post ID and URL.`,
      };
      this.data.publish_log.unshift(log);
      await this.save();
      return post;
    });
  }

  /** @deprecated use queuePost — name historically implied external publish. */
  async publishPost(
    id: string,
    via: PublishLog["via"],
  ): Promise<Post | null> {
    return this.queuePost(id, via);
  }

  /**
   * Mark published ONLY with a real provider post id (never invent).
   * Allowed from queued only.
   */
  async confirmPublished(
    id: string,
    opts: {
      providerPostId: string;
      providerUrl?: string | null;
      via?: PublishLog["via"];
      note?: string;
    },
  ): Promise<Post | null> {
    const providerPostId = opts.providerPostId?.trim();
    if (!providerPostId) {
      throw new MarketingStoreError(
        "providerPostId required to confirm publish",
        "POST_PROVIDER_ID_REQUIRED",
        400,
      );
    }
    return this.runExclusive(async () => {
      await this.ensure();
      const post = this.data.posts.find((p) => p.id === id);
      if (!post) return null;
      if (post.status === "published") {
        if (post.provider_post_id === providerPostId) {
          return post;
        }
        throw new MarketingStoreError(
          "Published post cannot be confirmed with a different provider id.",
          "POST_PROVIDER_CONFLICT",
          409,
        );
      }
      assertPostTransition(post.status, "published");
      const at = nowIso();
      post.status = "published";
      post.provider_post_id = providerPostId;
      if (opts.providerUrl !== undefined) {
        post.provider_url = opts.providerUrl;
      }
      post.published_at = at;
      post.note =
        opts.note ??
        `Published · provider id ${providerPostId}${opts.providerUrl ? ` · ${opts.providerUrl}` : ""}`;
      this.data.publish_log.unshift({
        id: `pub_${randomUUID().slice(0, 8)}`,
        post_id: post.id,
        platform: post.platform,
        at,
        via: opts.via ?? "hitl_approve",
        actor: "provider_confirmation",
        note: `Provider confirmed post id=${providerPostId}${opts.providerUrl ? ` url=${opts.providerUrl}` : ""}`,
      });
      await this.save();
      return post;
    });
  }

  async listPublishLog(limit = 50): Promise<PublishLog[]> {
    await this.ensure();
    return this.data.publish_log.slice(0, limit);
  }

  async rejectPost(id: string, note?: string): Promise<Post | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      const post = this.data.posts.find((p) => p.id === id);
      if (!post) return null;
      if (
        post.status === "queued" ||
        post.status === "published"
      ) {
        throw new MarketingStoreError(
          `Post in status ${post.status} cannot be rejected.`,
          "INVALID_TRANSITION",
          409,
        );
      }
      if (post.status === "rejected") return post;
      assertPostTransition(post.status, "rejected");
      post.status = "rejected";
      if (note) post.note = note;
      await this.save();
      return post;
    });
  }

  async restoreRejectedPost(id: string, note?: string): Promise<Post | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      const post = this.data.posts.find((p) => p.id === id);
      if (!post) return null;
      if (post.status === "pending") return post;
      if (post.status === "rejected") {
        assertPostTransition(post.status, "pending");
        post.status = "pending";
        if (note) post.note = note;
        await this.save();
        return post;
      }
      throw new MarketingStoreError(
        `Post in status ${post.status} cannot be restored.`,
        "INVALID_TRANSITION",
        409,
      );
    });
  }

  async cancelQueuedPost(id: string, note?: string): Promise<Post | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      const post = this.data.posts.find((p) => p.id === id);
      if (!post) return null;
      if (post.status === "pending") return post;
      if (post.status === "queued") {
        assertPostTransition(post.status, "pending");
        post.status = "pending";
        post.note =
          note ??
          "Cancelled queued publish to allow edits. You may re-queue from pending.";
        await this.save();
        return post;
      }
      throw new MarketingStoreError(
        `Post in status ${post.status} cannot be cancelled to pending.`,
        "INVALID_TRANSITION",
        409,
      );
    });
  }

  async updatePendingPostContent(
    id: string,
    patch: {
      title?: string | null;
      body?: string;
      rationale?: string;
    },
  ): Promise<Post> {
    return this.runExclusive(async () => {
      await this.ensure();
      const idx = this.data.posts.findIndex((p) => p.id === id);
      if (idx < 0) {
        throw new MarketingStoreError("post not found", "POST_NOT_FOUND", 404);
      }
      const existing = this.data.posts[idx];
      assertPostEditable(existing);
      if (patch.body !== undefined) {
        existing.body = patch.body;
      }
      if (patch.title !== undefined) {
        existing.title = patch.title;
      }
      if (patch.rationale !== undefined) {
        existing.rationale = patch.rationale;
      }
      await this.save();
      return existing;
    });
  }

  async addLoop(loop: LoopRun): Promise<LoopRun> {
    return this.runExclusive(async () => {
      await this.ensure();
      this.data.loops.unshift(loop);
      await this.save();
      return loop;
    });
  }

  async updateLoop(
    id: string,
    patch: Partial<Omit<LoopRun, "id">>,
  ): Promise<LoopRun | null> {
    return this.runExclusive(async () => {
      await this.ensure();
      const loop = this.data.loops.find((l) => l.id === id);
      if (!loop) return null;
      Object.assign(loop, patch);
      await this.save();
      return loop;
    });
  }

  async listLoops(): Promise<LoopRun[]> {
    await this.ensure();
    return [...this.data.loops].sort((a, b) =>
      b.started_at.localeCompare(a.started_at),
    );
  }

  async getAutonomy(): Promise<AutonomyLevel> {
    await this.ensure();
    return this.data.autonomy;
  }

  async setAutonomy(level: AutonomyLevel): Promise<AutonomyLevel> {
    return this.runExclusive(async () => {
      await this.ensure();
      this.data.autonomy = level;
      await this.save();
      return level;
    });
  }

  async getCampaign(): Promise<CampaignBrief | null> {
    await this.ensure();
    return this.data.campaign ?? null;
  }

  async setCampaign(campaign: CampaignBrief): Promise<CampaignBrief> {
    return this.runExclusive(async () => {
      await this.ensure();
      this.data.campaign = campaign;
      await this.save();
      return campaign;
    });
  }

  /** Monthly usage for the current UTC period (rolls automatically). */
  async getUsage(): Promise<UsageMeter> {
    await this.ensure();
    const period = currentUsagePeriod();
    const u = this.data.usage;
    if (!u || u.period !== period) {
      return {
        period,
        generations: 0,
        by_kind: {},
        updated_at: nowIso(),
      };
    }
    return { ...u, by_kind: { ...u.by_kind } };
  }

  /** Increment generation counter (expensive agent/LLM/scrape work). */
  async incrementUsage(kind: string, n = 1): Promise<UsageMeter> {
    return this.runExclusive(async () => {
      await this.ensure();
      const period = currentUsagePeriod();
      const add = Math.max(1, Math.floor(n));
      const prev =
        this.data.usage && this.data.usage.period === period
          ? this.data.usage
          : {
              period,
              generations: 0,
              by_kind: {} as Record<string, number>,
              updated_at: nowIso(),
            };
      const key = (kind || "other").slice(0, 48);
      const next: UsageMeter = {
        period,
        generations: prev.generations + add,
        by_kind: {
          ...prev.by_kind,
          [key]: (prev.by_kind[key] ?? 0) + add,
        },
        updated_at: nowIso(),
      };
      this.data.usage = next;
      await this.save();
      return next;
    });
  }
}

const singletons = new Map<string, MarketingStore>();

export function getMarketingStore(): MarketingStore {
  const owner = getWorkspaceOwnerId()?.trim() || "anonymous";
  let store = singletons.get(owner);
  if (!store) {
    store = MarketingStore.fromDefault();
    singletons.set(owner, store);
  }
  return store;
}

/** Test helper — clear in-process cache after backend/env changes. */
export function resetMarketingStoreCache(): void {
  singletons.clear();
}
