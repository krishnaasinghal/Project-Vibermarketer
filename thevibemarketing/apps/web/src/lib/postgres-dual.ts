/**
 * Postgres dual path for production:
 *   USE_POSTGRES_DUAL=1
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (server only — never NEXT_PUBLIC)
 *
 * Workspaces are owned by auth.users.id — never a shared null-owner fund.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import type {
  Founder,
  Memo,
  Product,
  Screening,
  Signal,
  StoreData,
  Thesis,
  TraceStep,
} from "@vibe/engine";
import { getWorkspaceOwnerId } from "./workspace-context";

function dualEnabled(): boolean {
  const hasCreds =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (!hasCreds) return false;
  // Explicit opt-out
  if (process.env.USE_POSTGRES_DUAL === "0") return false;
  // Explicit on, or Vercel (serverless /tmp is not durable across instances)
  if (process.env.USE_POSTGRES_DUAL === "1") return true;
  return Boolean(process.env.VERCEL);
}

let admin: SupabaseClient | null = null;
const workspaceByOwner = new Map<string, string>();

function getAdmin(): SupabaseClient | null {
  if (!dualEnabled()) return null;
  if (admin) return admin;
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return admin;
}

function resolveOwnerId(): string | null {
  const fromCtx = getWorkspaceOwnerId()?.trim();
  if (fromCtx && fromCtx !== "local-bypass") return fromCtx;
  const envOwner = process.env.VC_BRAIN_OWNER_ID?.trim();
  if (envOwner) return envOwner;
  return null;
}

async function ensureWorkspace(sb: SupabaseClient): Promise<string | null> {
  const ownerId = resolveOwnerId();
  if (!ownerId) {
    console.error(
      "[postgres-dual] refusing workspace without owner_id (set auth context)",
    );
    return null;
  }

  const cached = workspaceByOwner.get(ownerId);
  if (cached) return cached;

  // Shared workspace ID only when explicitly opted in (never default — breaks multi-tenant).
  const envWs = process.env.VC_BRAIN_WORKSPACE_ID?.trim();
  if (envWs && process.env.ALLOW_SHARED_WORKSPACE === "1") {
    workspaceByOwner.set(ownerId, envWs);
    return envWs;
  }

  const { data: existingRows } = await sb
    .from("workspaces")
    .select("id, thesis")
    .eq("kind", "fund")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (existingRows?.length) {
    // Prefer the workspace that already has founders (race can create empties).
    let bestId = existingRows[0]!.id as string;
    let bestCount = -1;
    let thesisFromSibling: unknown = null;
    for (const row of existingRows) {
      if (row.thesis && !thesisFromSibling) thesisFromSibling = row.thesis;
      const { count } = await sb
        .from("founders")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", row.id);
      const n = count ?? 0;
      if (n > bestCount) {
        bestCount = n;
        bestId = row.id as string;
      }
    }
    const best = existingRows.find((r) => r.id === bestId);
    if (thesisFromSibling && best && !best.thesis) {
      await sb
        .from("workspaces")
        .update({ thesis: thesisFromSibling })
        .eq("id", bestId);
    }
    // Drop empty duplicate fund workspaces for this owner (keep best).
    for (const row of existingRows) {
      if (row.id === bestId) continue;
      const { count } = await sb
        .from("founders")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", row.id);
      if ((count ?? 0) === 0) {
        await sb.from("workspaces").delete().eq("id", row.id);
      }
    }
    workspaceByOwner.set(ownerId, bestId);
    return bestId;
  }

  const { data: created, error } = await sb
    .from("workspaces")
    .insert({
      kind: "fund",
      name: "VC Brain",
      owner_id: ownerId,
    })
    .select("id")
    .single();
  if (error || !created?.id) {
    // Concurrent create race — re-select the oldest fund workspace.
    const { data: again } = await sb
      .from("workspaces")
      .select("id")
      .eq("kind", "fund")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (again?.id) {
      workspaceByOwner.set(ownerId, again.id as string);
      return again.id as string;
    }
    console.error("[postgres-dual] workspace:", error?.message);
    return null;
  }
  workspaceByOwner.set(ownerId, created.id as string);
  return created.id as string;
}

function contentHash(source: string, url: string | undefined, payload: unknown): string {
  return createHash("sha256")
    .update(source)
    .update("|")
    .update(url ?? "")
    .update("|")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex")
    .slice(0, 32);
}

function requireDualAdmin(): SupabaseClient {
  const sb = getAdmin();
  if (!sb) {
    throw new Error(
      "[postgres-dual] service role / USE_POSTGRES_DUAL not configured",
    );
  }
  return sb;
}

async function requireWorkspace(sb: SupabaseClient): Promise<string> {
  const ws = await ensureWorkspace(sb);
  if (!ws) {
    throw new Error(
      "[postgres-dual] workspace missing — auth owner context required",
    );
  }
  return ws;
}

export async function dualWriteSignal(signal: Signal): Promise<void> {
  if (!dualEnabled()) return;
  const sb = requireDualAdmin();
  const ws = await requireWorkspace(sb);
  const { error } = await sb.from("signals").upsert(
    {
      workspace_id: ws,
      entity_type: signal.entity_type,
      entity_id: signal.entity_id,
      source: signal.source,
      url: signal.url ?? null,
      payload: signal.payload,
      content_hash: contentHash(signal.source, signal.url, signal.payload),
      observed_at: signal.observed_at,
      ingested_at: signal.ingested_at,
    },
    { onConflict: "workspace_id,entity_id,source,content_hash", ignoreDuplicates: true },
  );
  if (error) throw new Error(`[postgres-dual] signal: ${error.message}`);
}

export async function dualWriteFounder(
  founder: Founder,
  opts?: { trigger?: string; pipeline_run_id?: string; prev_score?: number },
): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  const ws = await ensureWorkspace(sb);
  if (!ws) return;

  const { error: upErr } = await sb.from("founders").upsert(
    {
      id: founder.id,
      workspace_id: ws,
      name: founder.name,
      handles: founder.handles,
      links: founder.links ?? [],
      bio: founder.bio ?? null,
      claims: founder.claims ?? [],
      founder_score: founder.founder_score,
      score_confidence: founder.score_confidence,
      gravity: founder.gravity,
      activation: founder.activation ?? null,
      created_at: founder.created_at,
      updated_at: founder.updated_at,
    },
    { onConflict: "workspace_id,id" },
  );
  if (upErr) throw new Error(`[postgres-dual] founder: ${upErr.message}`);

  const prev = opts?.prev_score;
  const delta =
    typeof prev === "number"
      ? Math.abs(founder.founder_score - prev)
      : Number.POSITIVE_INFINITY;
  if (delta < 0.5) return;

  const { error: evErr } = await sb.from("founder_score_events").insert({
    workspace_id: ws,
    founder_id: founder.id,
    score: founder.founder_score,
    confidence: founder.score_confidence,
    gravity_score: founder.gravity?.gravity_score ?? null,
    trigger: opts?.trigger ?? "upsert",
    pipeline_run_id: opts?.pipeline_run_id ?? null,
    rationale: founder.gravity?.evidence?.[0] ?? null,
    at: founder.updated_at,
  });
  if (evErr) throw new Error(`[postgres-dual] score_event: ${evErr.message}`);
}

export async function dualWriteProduct(product: Product): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  const ws = await ensureWorkspace(sb);
  if (!ws) return;

  // FK: products (workspace_id, founder_id) → founders (workspace_id, id).
  // Guard against races / id-merge mismatches so product never lands orphaned.
  const { data: parent } = await sb
    .from("founders")
    .select("id")
    .eq("workspace_id", ws)
    .eq("id", product.founder_id)
    .maybeSingle();

  if (!parent) {
    const now = new Date().toISOString();
    const { error: stubErr } = await sb.from("founders").upsert(
      {
        id: product.founder_id,
        workspace_id: ws,
        name: product.name || "Founder",
        handles: {},
        links: [],
        claims: [],
        founder_score: 0,
        score_confidence: 0,
        gravity: {},
        created_at: now,
        updated_at: now,
      },
      { onConflict: "workspace_id,id" },
    );
    if (stubErr) {
      throw new Error(
        `[postgres-dual] product parent founder: ${stubErr.message}`,
      );
    }
  }

  const { error } = await sb.from("products").upsert(
    {
      id: product.id,
      workspace_id: ws,
      founder_id: product.founder_id,
      name: product.name,
      domain: product.domain ?? null,
      oneliner: product.oneliner ?? null,
      sector: product.sector ?? null,
      stage: product.stage ?? null,
      traction_claims: product.traction_claims ?? [],
    },
    { onConflict: "workspace_id,id" },
  );
  if (error) throw new Error(`[postgres-dual] product: ${error.message}`);
}

export async function dualWriteScreening(screening: Screening): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  const ws = await ensureWorkspace(sb);
  if (!ws) return;

  const { error } = await sb.from("screen_runs").insert({
    workspace_id: ws,
    founder_id: screening.founder_id,
    product_id: screening.product_id ?? null,
    founder_axis: screening.founder_axis,
    market_axis: screening.market_axis,
    idea_axis: screening.idea_axis,
    thesis_fit: null,
    scored_at: screening.scored_at,
    created_at: screening.scored_at,
  });
  if (error) throw new Error(`[postgres-dual] screening: ${error.message}`);
}

export async function dualWriteMemo(memo: Memo): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  const ws = await ensureWorkspace(sb);
  if (!ws) return;

  const payload = {
    founder_id: memo.founder_id,
    product_id: memo.product_id ?? null,
    decision: memo.decision,
    decision_conf: memo.decision_conf,
    sections: memo.sections,
    claims: memo.claims ?? [],
    gaps: memo.gaps ?? [],
    created_at: memo.created_at,
    memory_id: memo.id,
  };

  const { data: existing } = await sb
    .from("memos")
    .select("id")
    .eq("workspace_id", ws)
    .eq("memory_id", memo.id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb.from("memos").update(payload).eq("id", existing.id);
    if (error) throw new Error(`[postgres-dual] memo update: ${error.message}`);
    return;
  }

  // memos.screen_run_id is required + unique — create a screen_run row to attach.
  const { data: screen, error: sErr } = await sb
    .from("screen_runs")
    .insert({
      workspace_id: ws,
      founder_id: memo.founder_id,
      product_id: memo.product_id ?? null,
      founder_axis: {
        score: 0,
        label: "memo-link",
        trend: "stable",
        rationale: "",
        confidence: 0,
      },
      market_axis: {
        score: 0,
        label: "memo-link",
        trend: "stable",
        rationale: "",
        confidence: 0,
      },
      idea_axis: {
        score: 0,
        label: "memo-link",
        trend: "stable",
        rationale: "",
        confidence: 0,
      },
      scored_at: memo.created_at,
      created_at: memo.created_at,
    })
    .select("id")
    .single();
  if (sErr || !screen?.id) {
    throw new Error(`[postgres-dual] memo screen_run: ${sErr?.message ?? "no id"}`);
  }

  const { error } = await sb.from("memos").insert({
    workspace_id: ws,
    screen_run_id: screen.id,
    ...payload,
  });
  if (error) throw new Error(`[postgres-dual] memo: ${error.message}`);
}

export async function dualWriteTrace(step: TraceStep): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  const ws = await ensureWorkspace(sb);
  if (!ws) return;

  const founderId =
    typeof step.input === "object" &&
    step.input &&
    "founder_id" in step.input &&
    typeof (step.input as { founder_id?: unknown }).founder_id === "string"
      ? (step.input as { founder_id: string }).founder_id
      : null;

  const { error } = await sb.from("traces").insert({
    workspace_id: ws,
    pipeline_run_id: step.run_id,
    founder_id: founderId,
    step: step.step,
    input: step.input ?? null,
    output: step.output ?? null,
    evidence: step.evidence ?? [],
    ts: step.ts,
  });
  if (error) throw new Error(`[postgres-dual] trace: ${error.message}`);
}

export async function dualWriteThesis(thesis: Thesis): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  const ws = await ensureWorkspace(sb);
  if (!ws) return;

  const { error } = await sb
    .from("workspaces")
    .update({ thesis })
    .eq("id", ws);
  if (error) throw new Error(`[postgres-dual] thesis: ${error.message}`);
}

export function isPostgresDualEnabled(): boolean {
  return dualEnabled();
}

function emptyGravity() {
  return {
    gravity_score: 0,
    confidence: 0,
    components: {
      velocity: 0,
      pull_ratio: 0,
      cadence: 0,
      stars: 0,
      forks: 0,
      hn_points: 0,
      followers: 0,
      engagement: 0,
      post_count: 0,
      shipping_events: 0,
      audience: 1,
      external_engagement: 0,
      own_output: 1,
    },
    evidence: [] as string[],
    abstain: true as const,
    abstain_reason: "Not yet scored",
  };
}

/** Pull durable Memory from the caller's owned workspace. */
export async function fetchStoreBundleFromPostgres(): Promise<StoreData | null> {
  const sb = getAdmin();
  if (!sb) return null;
  const ws = await ensureWorkspace(sb);
  if (!ws) return null;

  const [
    { data: workspace },
    { data: founders, error: fErr },
    { data: products, error: pErr },
    { data: signals, error: sErr },
    { data: scoreEvents, error: eErr },
    { data: screenRuns, error: scErr },
    { data: memos, error: mErr },
    { data: traces, error: tErr },
  ] = await Promise.all([
    sb.from("workspaces").select("thesis").eq("id", ws).maybeSingle(),
    sb.from("founders").select("*").eq("workspace_id", ws).order("founder_score", { ascending: false }),
    sb.from("products").select("*").eq("workspace_id", ws),
    sb
      .from("signals")
      .select("*")
      .eq("workspace_id", ws)
      .order("observed_at", { ascending: false })
      .limit(2000),
    sb
      .from("founder_score_events")
      .select("founder_id, score, confidence, at")
      .eq("workspace_id", ws)
      .order("at", { ascending: true })
      .limit(5000),
    sb
      .from("screen_runs")
      .select("*")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: true })
      .limit(500),
    sb
      .from("memos")
      .select("*")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: true })
      .limit(200),
    sb
      .from("traces")
      .select("*")
      .eq("workspace_id", ws)
      .order("ts", { ascending: true })
      .limit(2000),
  ]);

  if (fErr) {
    console.error("[postgres-dual] hydrate founders:", fErr.message);
    return null;
  }
  if (pErr) console.error("[postgres-dual] hydrate products:", pErr.message);
  if (sErr) console.error("[postgres-dual] hydrate signals:", sErr.message);
  if (eErr) console.error("[postgres-dual] hydrate score events:", eErr.message);
  if (scErr) console.error("[postgres-dual] hydrate screenings:", scErr.message);
  if (mErr) console.error("[postgres-dual] hydrate memos:", mErr.message);
  if (tErr) console.error("[postgres-dual] hydrate traces:", tErr.message);
  const hasAny =
    (founders?.length ?? 0) > 0 ||
    (products?.length ?? 0) > 0 ||
    (screenRuns?.length ?? 0) > 0 ||
    (memos?.length ?? 0) > 0 ||
    Boolean(workspace?.thesis);
  if (!hasAny) return null;

  const historyByFounder = new Map<
    string,
    Array<{ score: number; confidence: number; at: string; gravity?: number }>
  >();
  for (const ev of scoreEvents ?? []) {
    const fid = ev.founder_id as string;
    const list = historyByFounder.get(fid) ?? [];
    list.push({
      score: Number(ev.score ?? 0),
      confidence: Number((ev as { confidence?: number }).confidence ?? 0),
      at: (ev.at as string) ?? new Date().toISOString(),
    });
    historyByFounder.set(fid, list);
  }

  const mappedFounders: Founder[] = (founders ?? []).map((row) => {
    const g = (row.gravity ?? {}) as Founder["gravity"];
    const history = historyByFounder.get(row.id as string);
    return {
      id: row.id as string,
      name: row.name as string,
      handles: (row.handles ?? {}) as Founder["handles"],
      links: (row.links ?? []) as string[],
      bio: (row.bio as string | null) ?? undefined,
      claims: Array.isArray(row.claims) ? (row.claims as Founder["claims"]) : [],
      founder_score: Number(row.founder_score ?? 0),
      score_confidence: Number(row.score_confidence ?? 0),
      gravity: g && typeof g.gravity_score === "number" ? g : emptyGravity(),
      activation: (row.activation as Founder["activation"]) ?? undefined,
      score_history: history?.length ? history : undefined,
      created_at: (row.created_at as string) ?? new Date().toISOString(),
      updated_at: (row.updated_at as string) ?? new Date().toISOString(),
    };
  });

  const mappedProducts: Product[] = (products ?? []).map((row) => ({
    id: row.id as string,
    founder_id: row.founder_id as string,
    name: row.name as string,
    domain: (row.domain as string | null) ?? undefined,
    oneliner: (row.oneliner as string | null) ?? undefined,
    sector: (row.sector as string | null) ?? undefined,
    stage: (row.stage as string | null) ?? undefined,
    traction_claims: (row.traction_claims as Product["traction_claims"]) ?? [],
  }));

  const mappedSignals: Signal[] = (signals ?? []).map((row) => ({
    id: row.id as string,
    entity_type: row.entity_type as Signal["entity_type"],
    entity_id: row.entity_id as string,
    source: row.source as string,
    url: (row.url as string | null) ?? undefined,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    observed_at: row.observed_at as string,
    ingested_at: row.ingested_at as string,
  }));

  const mappedScreenings: Screening[] = (screenRuns ?? [])
    .filter((row) => {
      // Skip placeholder rows created only to satisfy memos.screen_run_id FK.
      const fa = row.founder_axis as { label?: string } | null;
      return fa?.label !== "memo-link";
    })
    .map((row) => ({
      founder_id: row.founder_id as string,
      product_id: (row.product_id as string | null) ?? undefined,
      founder_axis: row.founder_axis as Screening["founder_axis"],
      market_axis: row.market_axis as Screening["market_axis"],
      idea_axis: row.idea_axis as Screening["idea_axis"],
      scored_at:
        (row.scored_at as string | null) ??
        (row.created_at as string) ??
        new Date().toISOString(),
    }));

  const mappedMemos: Memo[] = (memos ?? []).map((row) => ({
    id: (row.memory_id as string | null) ?? (row.id as string) ?? randomUUID(),
    founder_id: row.founder_id as string,
    product_id: (row.product_id as string | null) ?? undefined,
    sections: (row.sections as Memo["sections"]) ?? [],
    decision: row.decision as Memo["decision"],
    decision_conf: Number(row.decision_conf ?? 0),
    claims: Array.isArray(row.claims) ? (row.claims as Memo["claims"]) : [],
    gaps: Array.isArray(row.gaps) ? (row.gaps as string[]) : [],
    created_at: (row.created_at as string) ?? new Date().toISOString(),
  }));

  const mappedTraces: TraceStep[] = (traces ?? []).map((row) => ({
    run_id: row.pipeline_run_id as string,
    step: row.step as string,
    input: row.input ?? null,
    output: row.output ?? null,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    ts: (row.ts as string) ?? new Date().toISOString(),
  }));

  return {
    founders: mappedFounders,
    products: mappedProducts,
    signals: mappedSignals,
    thesis: (workspace?.thesis as Thesis | null) ?? null,
    screenings: mappedScreenings,
    memos: mappedMemos,
    traces: mappedTraces,
  };
}

/**
 * Point lookup for a single founder in the caller's workspace.
 * Used when serverless /tmp is cold and full hydrate missed a row (or id alias).
 */
export async function fetchFounderFromPostgres(
  founderId: string,
): Promise<Founder | null> {
  const id = founderId?.trim();
  if (!id) return null;
  const sb = getAdmin();
  if (!sb) return null;
  const ws = await ensureWorkspace(sb);
  if (!ws) return null;

  const { data: row, error } = await sb
    .from("founders")
    .select("*")
    .eq("workspace_id", ws)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[postgres-dual] founder lookup:", error.message);
    return null;
  }
  if (!row) return null;

  const { data: events } = await sb
    .from("founder_score_events")
    .select("score, confidence, at")
    .eq("workspace_id", ws)
    .eq("founder_id", id)
    .order("at", { ascending: true })
    .limit(40);

  const g = (row.gravity ?? {}) as Founder["gravity"];
  const history =
    events?.map((ev) => ({
      score: Number(ev.score ?? 0),
      confidence: Number((ev as { confidence?: number }).confidence ?? 0),
      at: (ev.at as string) ?? new Date().toISOString(),
    })) ?? [];

  return {
    id: row.id as string,
    name: row.name as string,
    handles: (row.handles ?? {}) as Founder["handles"],
    links: (row.links ?? []) as string[],
    bio: (row.bio as string | null) ?? undefined,
    claims: Array.isArray(row.claims) ? (row.claims as Founder["claims"]) : [],
    founder_score: Number(row.founder_score ?? 0),
    score_confidence: Number(row.score_confidence ?? 0),
    gravity: g && typeof g.gravity_score === "number" ? g : emptyGravity(),
    activation: (row.activation as Founder["activation"]) ?? undefined,
    score_history: history.length ? history : undefined,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
    updated_at: (row.updated_at as string) ?? new Date().toISOString(),
  };
}
