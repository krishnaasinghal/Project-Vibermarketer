import { tmpdir } from "node:os";
import path from "node:path";

/** Repo root when Next runs from apps/web */
export function projectRoot(): string {
  return path.resolve(process.cwd(), "../..");
}

/** Local/dev data dir under the monorepo (not writable on Vercel). */
export function dataPath(...parts: string[]): string {
  return path.join(projectRoot(), "data", ...parts);
}

function isServerlessFs(): boolean {
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

/**
 * Writable path for ephemeral files.
 * Vercel/Lambda: /tmp only. Local: repo data/.
 */
export function writableDataPath(...parts: string[]): string {
  if (isServerlessFs()) {
    return path.join(tmpdir(), "vibemarketer-data", ...parts);
  }
  return dataPath(...parts);
}
