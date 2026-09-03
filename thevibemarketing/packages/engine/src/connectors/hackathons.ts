import type { NormalizedIngestItem } from "./types";

export type SourceFetchResult = {
  ok: boolean;
  items: NormalizedIngestItem[];
  error?: string;
  status?: number;
};

/**
 * No live hackathon winners API is configured.
 * Never invent winners. Wire Devpost/MLH later.
 */
export function fetchHackathonWinners(): SourceFetchResult {
  return {
    ok: false,
    items: [],
    error: "not configured — hackathon API unset; refusing fabricated fallbacks",
    status: 501,
  };
}
