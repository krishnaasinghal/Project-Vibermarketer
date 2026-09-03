/** Parse fetch Response as JSON without throwing on empty/HTML error bodies. */
export async function readJsonSafe<T = Record<string, unknown>>(
  res: Response,
): Promise<{ data: T | null; text: string; parseError?: string }> {
  const text = await res.text();
  if (!text.trim()) {
    return { data: null, text: "", parseError: "empty response" };
  }
  try {
    return { data: JSON.parse(text) as T, text };
  } catch (e) {
    return {
      data: null,
      text,
      parseError: e instanceof Error ? e.message : "invalid JSON",
    };
  }
}
