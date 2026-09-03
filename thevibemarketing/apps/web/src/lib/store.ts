import {
  MemoryStore,
  type Founder,
  type Memo,
  type Product,
  type Screening,
  type Signal,
  type StoreData,
  type Thesis,
  type TraceStep,
} from "@vibe/engine";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dualWriteFounder,
  dualWriteMemo,
  dualWriteProduct,
  dualWriteScreening,
  dualWriteSignal,
  dualWriteThesis,
  dualWriteTrace,
  fetchFounderFromPostgres,
  fetchStoreBundleFromPostgres,
  isPostgresDualEnabled,
} from "./postgres-dual";
import { projectRoot } from "./paths";
import { getWorkspaceOwnerId } from "./workspace-context";

/** Merge durable Postgres rows with instance-local /tmp rows (union by id). */
function unionById<T extends { id: string }>(
  primary: T[],
  secondary: T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of secondary) map.set(row.id, row);
  // Primary (Postgres) wins on conflict — durable truth.
  for (const row of primary) map.set(row.id, row);
  return [...map.values()];
}

function unionSignals(
  primary: Signal[],
  secondary: Signal[],
): Signal[] {
  const map = new Map<string, Signal>();
  for (const row of secondary) map.set(row.id, row);
  for (const row of primary) map.set(row.id, row);
  return [...map.values()];
}

function dualWriteFailClosed(): boolean {
  // When dual-write is on, never report success if Postgres failed.
  // Opt out only with DUAL_WRITE_FAIL_CLOSED=0 (local debugging).
  if (!isPostgresDualEnabled()) return false;
  if (process.env.DUAL_WRITE_FAIL_CLOSED === "0") return false;
  return true;
}

async function runDualWrite(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[store] ${label}`, e);
    if (dualWriteFailClosed()) throw e;
  }
}

/**
 * Per-owner MemoryStore. On Vercel, cache under /tmp; Postgres is durable.
 */
class DualMemoryStore extends MemoryStore {
  private pgHydrated = false;
  private lastHydrateAt = 0;

  override async load(): Promise<StoreData> {
    const local = await super.load();
    // Re-hydrate from Postgres regularly — /tmp is per-instance and not shared.
    // Skip only within a short warm window on the same instance.
    const warmMs = 8_000;
    if (
      this.pgHydrated &&
      local.founders.length > 0 &&
      Date.now() - this.lastHydrateAt < warmMs
    ) {
      return local;
    }
    const bundle = await fetchStoreBundleFromPostgres();
    this.pgHydrated = true;
    this.lastHydrateAt = Date.now();
    if (
      bundle &&
      (bundle.founders.length ||
        bundle.products.length ||
        bundle.screenings.length ||
        bundle.memos.length ||
        bundle.thesis)
    ) {
      // Union merge: never drop instance-local founders that dual-write has not
      // yet been visible on a cold instance — and never drop durable PG rows.
      const founders = unionById(bundle.founders, local.founders).map((f) => {
        if (f.claims?.length) return f;
        const loc = local.founders.find((lf) => lf.id === f.id);
        return loc?.claims?.length ? { ...f, claims: loc.claims } : f;
      });
      const products = unionById(bundle.products, local.products);
      const signals = unionSignals(bundle.signals, local.signals);
      const screenings = [
        ...local.screenings.filter(
          (s) =>
            !bundle.screenings.some(
              (b) =>
                b.founder_id === s.founder_id && b.scored_at === s.scored_at,
            ),
        ),
        ...bundle.screenings,
      ];
      const memos = unionById(bundle.memos, local.memos);
      const traces = [
        ...local.traces.filter(
          (t) =>
            !bundle.traces.some(
              (b) => b.run_id === t.run_id && b.step === t.step && b.ts === t.ts,
            ),
        ),
        ...bundle.traces,
      ];
      const merged: StoreData = {
        ...bundle,
        founders,
        products,
        signals,
        screenings,
        memos,
        traces,
        thesis: bundle.thesis ?? local.thesis,
      };
      await this.replaceAll(merged);
      console.info(
        `[store] Hydrated ${merged.founders.length} founders · ${merged.products.length} products from Postgres (union)`,
      );
      return merged;
    }
    return local;
  }

  override async getFounder(id: string): Promise<Founder | undefined> {
    const hit = await super.getFounder(id);
    if (hit) return hit;
    // Cold instance / hydrate lag: point-read durable Postgres for this owner.
    try {
      const fromPg = await fetchFounderFromPostgres(id);
      if (fromPg) {
        await this.upsertFounder(fromPg);
        return fromPg;
      }
    } catch (e) {
      console.error("[store] getFounder PG fallback", e);
    }
    return undefined;
  }

  override async addSignal(
    signal: Omit<Signal, "id" | "ingested_at"> & {
      id?: string;
      ingested_at?: string;
    },
  ): Promise<Signal> {
    const saved = await super.addSignal(signal);
    await runDualWrite("dualWriteSignal", () => dualWriteSignal(saved));
    return saved;
  }

  override async upsertFounder(
    founder: Partial<Founder> & { name: string },
  ): Promise<Founder> {
    let prev: number | undefined;
    try {
      const id = founder.id;
      if (id) {
        const existing = (await this.load()).founders.find((f) => f.id === id);
        prev = existing?.founder_score;
      }
    } catch {
      /* ignore */
    }
    const saved = await super.upsertFounder(founder);
    await runDualWrite("dualWriteFounder", () =>
      dualWriteFounder(saved, {
        trigger: "upsert",
        prev_score: prev,
      }),
    );
    return saved;
  }

  override async upsertProduct(
    product: Partial<Product> & { name: string; founder_id: string },
  ): Promise<Product> {
    const saved = await super.upsertProduct(product);
    await runDualWrite("dualWriteProduct", () => dualWriteProduct(saved));
    return saved;
  }

  override async saveScreening(screening: Screening): Promise<Screening> {
    const saved = await super.saveScreening(screening);
    await runDualWrite("dualWriteScreening", () => dualWriteScreening(saved));
    return saved;
  }

  override async saveMemo(memo: Memo): Promise<Memo> {
    const saved = await super.saveMemo(memo);
    await runDualWrite("dualWriteMemo", () => dualWriteMemo(saved));
    return saved;
  }

  override async addTrace(step: TraceStep): Promise<TraceStep> {
    const saved = await super.addTrace(step);
    await runDualWrite("dualWriteTrace", () => dualWriteTrace(saved));
    return saved;
  }

  override async setThesis(thesis: Thesis): Promise<Thesis> {
    const saved = await super.setThesis(thesis);
    await runDualWrite("dualWriteThesis", () => dualWriteThesis(saved));
    return saved;
  }
}

const singletons = new Map<string, MemoryStore>();

function storeKey(): string {
  return getWorkspaceOwnerId()?.trim() || "anonymous";
}

function storePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  // Serverless: writable /tmp. Local: repo data/stores.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return join(tmpdir(), "vibemarketer-stores", `${safe}.json`);
  }
  return join(projectRoot(), "data", "stores", `${safe}.json`);
}

export function getStore(): MemoryStore {
  const key = storeKey();
  let store = singletons.get(key);
  if (!store) {
    const path = storePath(key);
    store = isPostgresDualEnabled()
      ? new DualMemoryStore(path)
      : new MemoryStore(path);
    if (isPostgresDualEnabled()) {
      console.info(`[store] Postgres dual-write + hydrate ON · owner=${key}`);
    }
    singletons.set(key, store);
  }
  return store;
}
