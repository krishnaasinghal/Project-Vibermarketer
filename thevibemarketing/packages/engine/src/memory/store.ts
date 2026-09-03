import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dedupeClaims } from '../scoring/trust';
import type {
  Founder,
  Memo,
  Product,
  Screening,
  Signal,
  StoreData,
  Thesis,
  TraceStep,
} from '../types';

/** Default persistence path — prefer MemoryStore.fromProjectRoot() from the web app. */
export const DEFAULT_STORE_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'store.json');

function emptyStore(): StoreData {
  return {
    founders: [],
    products: [],
    signals: [],
    thesis: null,
    screenings: [],
    memos: [],
    traces: [],
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function norm(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

function identityName(value: string | undefined | null): string {
  return norm(value).replace(/^@+/, '');
}

function normalizeHandles(handles: Founder['handles']): Founder['handles'] {
  const normalized = { ...handles };
  for (const key of ['github', 'hn', 'twitter', 'x'] as const) {
    const value = normalized[key];
    if (value) normalized[key] = identityName(value);
  }
  return normalized;
}

function githubHandle(handles: Founder['handles']): string {
  return identityName(handles.github);
}

function identityLink(value: string): string {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch {
    return norm(value);
  }
}

function shareIdentityLink(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return false;
  const identities = new Set(left.map(identityLink).filter(Boolean));
  return right.some((link) => identities.has(identityLink(link)));
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
    abstain_reason: 'Not yet scored',
  };
}

/**
 * Local JSON memory store — source-tagged, timestamped, deduped.
 */
export class MemoryStore {
  private data: StoreData = emptyStore();
  private loaded = false;

  constructor(public readonly path: string = DEFAULT_STORE_PATH) {}

  /** Next runs from apps/web — project root is two levels up. */
  static fromProjectRoot(root: string): MemoryStore {
    return getStore(join(root, 'data', 'store.json'));
  }

  async replaceAll(data: StoreData): Promise<void> {
    this.data = {
      founders: data.founders ?? [],
      products: data.products ?? [],
      signals: data.signals ?? [],
      thesis: data.thesis ?? null,
      screenings: data.screenings ?? [],
      memos: data.memos ?? [],
      traces: data.traces ?? [],
    };
    this.loaded = true;
    await this.save();
  }

  async getProductForFounder(founderId: string): Promise<Product | undefined> {
    await this.ensure();
    return this.data.products.find((p) => p.founder_id === founderId);
  }

  async getLatestScreening(founderId: string): Promise<Screening | undefined> {
    await this.ensure();
    return [...this.data.screenings]
      .filter((s) => s.founder_id === founderId)
      .sort((a, b) => b.scored_at.localeCompare(a.scored_at))[0];
  }

  async listScreenings(founderId: string): Promise<Screening[]> {
    await this.ensure();
    return this.data.screenings
      .filter((s) => s.founder_id === founderId)
      .sort((a, b) => a.scored_at.localeCompare(b.scored_at));
  }

  async getLatestMemo(founderId: string): Promise<Memo | undefined> {
    await this.ensure();
    return [...this.data.memos]
      .filter((m) => m.founder_id === founderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }

  async load(): Promise<StoreData> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      this.data = {
        founders: parsed.founders ?? [],
        products: parsed.products ?? [],
        signals: parsed.signals ?? [],
        thesis: parsed.thesis ?? null,
        screenings: parsed.screenings ?? [],
        memos: parsed.memos ?? [],
        traces: parsed.traces ?? [],
      };
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'ENOENT') {
        this.data = emptyStore();
        // Best-effort persist — serverless FS may be read-only; keep RAM store.
        await this.save().catch(() => undefined);
      } else {
        throw err;
      }
    }
    this.loaded = true;
    return this.data;
  }

  async save(): Promise<void> {
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      const body = JSON.stringify(this.data, null, 2);
      await writeFile(tmp, body, 'utf8');
      await rename(tmp, this.path);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err && 'code' in err
          ? (err as { code?: string }).code
          : undefined;
      // Vercel/ephemeral: continue in-memory; Postgres dual-write is durable path.
      if (code === 'EROFS' || code === 'EACCES' || code === 'ENOENT' || code === 'EPERM') {
        console.warn(`[MemoryStore] disk persist skipped (${code ?? 'error'}) — in-memory only`);
        return;
      }
      throw err;
    }
  }

  private async ensure(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  async upsertFounder(founder: Partial<Founder> & { name: string }): Promise<Founder> {
    await this.ensure();
    const existing = this.findDupe(founder);
    const ts = nowIso();

    if (existing) {
      const nextScore = founder.founder_score ?? existing.founder_score;
      const nextConf = founder.score_confidence ?? existing.score_confidence;
      const nextGravity = founder.gravity ?? existing.gravity;
      let score_history = founder.score_history ?? existing.score_history ?? [];
      const scoreChanged =
        typeof founder.founder_score === 'number' &&
        Math.abs(founder.founder_score - existing.founder_score) >= 0.5;
      if (scoreChanged) {
        score_history = [
          ...score_history,
          {
            score: nextScore,
            confidence: nextConf,
            at: ts,
            gravity: nextGravity?.gravity_score,
          },
        ].slice(-20);
      }
      const merged: Founder = {
        ...existing,
        ...founder,
        id: existing.id,
        handles: normalizeHandles({
          ...existing.handles,
          ...(founder.handles ?? {}),
        }),
        links: founder.links ?? existing.links,
        claims: founder.claims ?? existing.claims,
        gravity: nextGravity,
        founder_score: nextScore,
        score_confidence: nextConf,
        score_history,
        activation: founder.activation ?? existing.activation,
        created_at: existing.created_at,
        updated_at: ts,
      };
      this.data.founders = this.data.founders.map((f) => (f.id === merged.id ? merged : f));
      await this.save();
      return merged;
    }

    const created: Founder = {
      id: founder.id ?? randomUUID(),
      name: founder.name,
      handles: normalizeHandles(founder.handles ?? {}),
      links: founder.links ?? [],
      bio: founder.bio,
      claims: founder.claims ?? [],
      founder_score: founder.founder_score ?? 0,
      score_confidence: founder.score_confidence ?? 0,
      gravity: founder.gravity ?? emptyGravity(),
      score_history: founder.score_history ?? [
        {
          score: founder.founder_score ?? 0,
          confidence: founder.score_confidence ?? 0,
          at: ts,
          gravity: founder.gravity?.gravity_score ?? 0,
        },
      ],
      activation: founder.activation,
      created_at: founder.created_at ?? ts,
      updated_at: ts,
    };
    this.data.founders.push(created);
    await this.save();
    return created;
  }

  async upsertProduct(
    product: Partial<Product> & { name: string; founder_id: string },
  ): Promise<Product> {
    await this.ensure();
    const domain = norm(product.domain);
    const byId = product.id
      ? this.data.products.find((p) => p.id === product.id)
      : undefined;
    // Domain merge only within the same founder — never steal across founders.
    const byDomain =
      domain
        ? this.data.products.find(
            (p) =>
              p.founder_id === product.founder_id && norm(p.domain) === domain,
          )
        : undefined;
    const byName = this.data.products.find(
      (p) => p.founder_id === product.founder_id && norm(p.name) === norm(product.name),
    );
    const existing = byId ?? byDomain ?? byName;

    if (existing) {
      const merged: Product = {
        ...existing,
        ...product,
        id: existing.id,
        traction_claims: product.traction_claims ?? existing.traction_claims,
      };
      this.data.products = this.data.products.map((p) => (p.id === merged.id ? merged : p));
      await this.save();
      return merged;
    }

    const created: Product = {
      id: product.id ?? randomUUID(),
      founder_id: product.founder_id,
      name: product.name,
      domain: product.domain,
      oneliner: product.oneliner,
      sector: product.sector,
      stage: product.stage,
      traction_claims: product.traction_claims ?? [],
    };
    this.data.products.push(created);
    await this.save();
    return created;
  }

  async addSignal(
    signal: Omit<Signal, 'id' | 'ingested_at'> & { id?: string; ingested_at?: string },
  ): Promise<Signal> {
    await this.ensure();
    const row: Signal = {
      id: signal.id ?? randomUUID(),
      entity_type: signal.entity_type,
      entity_id: signal.entity_id,
      source: signal.source,
      url: signal.url,
      payload: signal.payload,
      observed_at: signal.observed_at,
      ingested_at: signal.ingested_at ?? nowIso(),
    };

    const dupe = this.data.signals.find(
      (s) =>
        s.entity_type === row.entity_type &&
        s.entity_id === row.entity_id &&
        s.source === row.source &&
        (row.url
          ? s.url === row.url
          : JSON.stringify(s.payload) === JSON.stringify(row.payload)),
    );
    if (dupe) {
      dupe.payload = { ...dupe.payload, ...row.payload };
      dupe.observed_at = row.observed_at;
      dupe.ingested_at = row.ingested_at;
      await this.save();
      return dupe;
    }

    this.data.signals.push(row);
    await this.save();
    return row;
  }

  async getFounder(id: string): Promise<Founder | undefined> {
    await this.ensure();
    return this.data.founders.find((f) => f.id === id);
  }

  async listFounders(): Promise<Founder[]> {
    await this.ensure();
    return [...this.data.founders].sort((a, b) => b.founder_score - a.founder_score);
  }

  async getSignalsFor(
    entityId: string,
    entityType?: Signal['entity_type'],
  ): Promise<Signal[]> {
    await this.ensure();
    return this.data.signals.filter(
      (s) => s.entity_id === entityId && (entityType ? s.entity_type === entityType : true),
    );
  }

  async setThesis(thesis: Thesis): Promise<Thesis> {
    await this.ensure();
    this.data.thesis = thesis;
    await this.save();
    return thesis;
  }

  async getThesis(): Promise<Thesis | null> {
    await this.ensure();
    return this.data.thesis;
  }

  async saveScreening(screening: Screening): Promise<Screening> {
    await this.ensure();
    this.data.screenings.push(screening);
    await this.save();
    return screening;
  }

  async saveMemo(memo: Memo): Promise<Memo> {
    await this.ensure();
    this.data.memos.push(memo);
    await this.save();
    return memo;
  }

  async addTrace(step: TraceStep): Promise<TraceStep> {
    await this.ensure();
    this.data.traces.push(step);
    await this.save();
    return step;
  }

  async getTraces(runId: string): Promise<TraceStep[]> {
    await this.ensure();
    return this.data.traces
      .filter((t) => t.run_id === runId)
      .sort((a, b) => a.ts.localeCompare(b.ts));
  }

  /** Latest run_id that referenced this founder in step input (for TraceDrawer reload). */
  async getLatestRunIdForFounder(founderId: string): Promise<string | undefined> {
    await this.ensure();
    const hits = this.data.traces.filter((t) => {
      const inp = t.input as { founder_id?: string; founderId?: string } | null;
      return inp?.founder_id === founderId || inp?.founderId === founderId;
    });
    if (!hits.length) return undefined;
    hits.sort((a, b) => b.ts.localeCompare(a.ts));
    return hits[0]?.run_id;
  }

  /** Merge founders that share normalized name, GitHub handle, or identity link. */
  async dedupeFounders(): Promise<{ merged: number; kept: number }> {
    await this.ensure();
    const kept: Founder[] = [];
    const idMap = new Map<string, string>();
    let merged = 0;

    for (const f of this.data.founders) {
      const match = kept.find(
        (k) =>
          identityName(k.name) === identityName(f.name) ||
          (githubHandle(k.handles) !== '' &&
            githubHandle(k.handles) === githubHandle(f.handles)) ||
          shareIdentityLink(k.links, f.links),
      );
      if (!match) {
        kept.push(f);
        continue;
      }
      match.handles = { ...f.handles, ...match.handles };
      match.links = [...new Set([...match.links, ...f.links])];
      match.claims = dedupeClaims([...match.claims, ...f.claims]);
      match.bio = match.bio || f.bio;
      if (f.founder_score > match.founder_score) {
        match.founder_score = f.founder_score;
        match.score_confidence = f.score_confidence;
        match.gravity = f.gravity;
      }
      match.updated_at = nowIso();
      idMap.set(f.id, match.id);
      merged += 1;
    }

    for (const p of this.data.products) {
      const mapped = idMap.get(p.founder_id);
      if (mapped) p.founder_id = mapped;
    }

    const products: Product[] = [];
    for (const p of this.data.products) {
      const hit = products.find(
        (x) =>
          (p.domain && norm(x.domain) === norm(p.domain)) ||
          (x.founder_id === p.founder_id && norm(x.name) === norm(p.name)),
      );
      if (hit) {
        hit.traction_claims = [...hit.traction_claims, ...p.traction_claims];
        hit.oneliner = hit.oneliner || p.oneliner;
        hit.sector = hit.sector || p.sector;
        hit.stage = hit.stage || p.stage;
      } else {
        products.push(p);
      }
    }
    this.data.products = products;

    for (const s of this.data.signals) {
      if (s.entity_type === 'founder') {
        const mapped = idMap.get(s.entity_id);
        if (mapped) s.entity_id = mapped;
      }
    }
    for (const sc of this.data.screenings) {
      const mapped = idMap.get(sc.founder_id);
      if (mapped) sc.founder_id = mapped;
    }
    for (const m of this.data.memos) {
      const mapped = idMap.get(m.founder_id);
      if (mapped) m.founder_id = mapped;
    }

    this.data.founders = kept;
    await this.save();
    return { merged, kept: kept.length };
  }

  async snapshot(): Promise<StoreData> {
    await this.ensure();
    return structuredClone(this.data);
  }

  private findDupe(founder: Partial<Founder> & { name: string }): Founder | undefined {
    const gh = githubHandle(founder.handles ?? {});
    return this.data.founders.find(
      (f) =>
        (founder.id && f.id === founder.id) ||
        identityName(f.name) === identityName(founder.name) ||
        (gh !== '' && githubHandle(f.handles) === gh) ||
        shareIdentityLink(f.links, founder.links ?? []),
    );
  }
}

let singleton: MemoryStore | null = null;

export function getStore(path: string = DEFAULT_STORE_PATH): MemoryStore {
  if (!singleton || singleton.path !== path) {
    singleton = new MemoryStore(path);
  }
  return singleton;
}
