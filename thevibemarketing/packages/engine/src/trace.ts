import { randomUUID } from 'node:crypto';
import type { TraceStep } from './types';
import { getStore, type MemoryStore } from './memory/store';

export type TraceRun = {
  run_id: string;
  started_at: string;
};

/** Start a traced run. Returns run_id for subsequent step() calls. */
export function startRun(prefix = 'run'): TraceRun {
  const run_id = `${prefix}_${randomUUID().slice(0, 8)}`;
  return { run_id, started_at: new Date().toISOString() };
}

/**
 * Record a step-level chain-of-thought / evidence log entry.
 * Pass `store` from the web app — default cwd path is wrong under apps/web.
 */
export async function step(
  runId: string,
  name: string,
  input: unknown,
  output: unknown,
  evidence: string[] = [],
  store?: MemoryStore,
): Promise<TraceStep> {
  const entry: TraceStep = {
    run_id: runId,
    step: name,
    input,
    output,
    evidence,
    ts: new Date().toISOString(),
  };
  if (!store) {
    console.warn(
      `[trace] step("${name}") called without store — using DEFAULT_STORE_PATH (may be wrong under apps/web)`,
    );
  }
  const mem = store ?? getStore();
  await mem.addTrace(entry);
  return entry;
}

/** In-memory-only step (no persistence) — useful for unit tests. */
export function stepLocal(
  runId: string,
  name: string,
  input: unknown,
  output: unknown,
  evidence: string[] = [],
): TraceStep {
  return {
    run_id: runId,
    step: name,
    input,
    output,
    evidence,
    ts: new Date().toISOString(),
  };
}
