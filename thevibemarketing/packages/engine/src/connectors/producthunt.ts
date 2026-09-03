import type { NormalizedIngestItem } from "./types";

export type SourceFetchResult = {
  ok: boolean;
  items: NormalizedIngestItem[];
  error?: string;
  status?: number;
};

/**
 * Product Hunt has no public unauthenticated API in this product.
 * Never invent launches. Wire a real token/API later.
 */
export function fetchProductHuntLaunches(): SourceFetchResult {
  return {
    ok: false,
    items: [],
    error: "not configured — PRODUCTHUNT_API_TOKEN unset; refusing fabricated fallbacks",
    status: 501,
  };
}
