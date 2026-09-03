import { readJsonSafe } from "@/lib/safe-json";

/**
 * Fetch + safe JSON parse for client pages.
 * Never throws on empty/HTML error bodies.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ res: Response; data: T | null; parseError?: string }> {
  const res = await fetch(input, init);
  const { data, parseError } = await readJsonSafe<T>(res);
  return { res, data, parseError };
}

export function apiError(
  data: { error?: string } | null | undefined,
  res: Response,
  fallback: string,
  parseError?: string,
): Error {
  const msg =
    data?.error ||
    (parseError
      ? `${fallback} (${res.status}): ${parseError}`
      : `${fallback} (${res.status})`);
  return new Error(msg);
}
