import type { NormalizedIngestItem } from "./types";

export type SourceFetchResult = {
  ok: boolean;
  items: NormalizedIngestItem[];
  error?: string;
  status?: number;
};

/**
 * No live accelerator directory API is configured.
 * Never invent cohort members. Wire YC/Techstars feeds later.
 */
export function fetchAcceleratorCohorts(): SourceFetchResult {
  return {
    ok: false,
    items: [],
    error: "not configured — accelerator API unset; refusing fabricated fallbacks",
    status: 501,
  };
}
