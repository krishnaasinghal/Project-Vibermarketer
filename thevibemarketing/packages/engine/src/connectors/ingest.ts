import { fetchAcceleratorCohorts } from "./accelerators";
import { fetchArxivAiDetailed } from "./arxiv";
import { fetchTrendingAiReposDetailed } from "./github";
import { fetchHackathonWinners } from "./hackathons";
import { fetchShowHnDetailed } from "./hackernews";
import { fetchProductHuntLaunches } from "./producthunt";
import { itemsToFounderDrafts, type IngestDraft } from "./to-founders";
import type { NormalizedIngestItem } from "./types";

export type IngestSourceStatus = {
  ok: boolean;
  count: number;
  error?: string;
  status?: number;
};

export type IngestSourcesMap = {
  github: IngestSourceStatus;
  hackernews: IngestSourceStatus;
  producthunt: IngestSourceStatus;
  arxiv: IngestSourceStatus;
  accelerator: IngestSourceStatus;
  hackathon: IngestSourceStatus;
};

export async function ingestAllSources(): Promise<NormalizedIngestItem[]> {
  const { items } = await ingestAllSourcesDetailed();
  return items;
}

export async function ingestAllSourcesDetailed(): Promise<{
  items: NormalizedIngestItem[];
  sources: IngestSourcesMap;
}> {
  const [gh, hn, arxiv, ph, accel, hacks] = await Promise.all([
    fetchTrendingAiReposDetailed(12),
    fetchShowHnDetailed(15),
    fetchArxivAiDetailed(8),
    Promise.resolve(fetchProductHuntLaunches()),
    Promise.resolve(fetchAcceleratorCohorts()),
    Promise.resolve(fetchHackathonWinners()),
  ]);

  return {
    items: [...gh.items, ...hn.items, ...arxiv.items, ...ph.items, ...accel.items, ...hacks.items],
    sources: {
      github: {
        ok: gh.ok,
        count: gh.items.length,
        error: gh.error,
        status: gh.status,
      },
      hackernews: {
        ok: hn.ok,
        count: hn.items.length,
        error: hn.error,
        status: hn.status,
      },
      producthunt: {
        ok: ph.ok,
        count: ph.items.length,
        error: ph.error,
        status: ph.status,
      },
      arxiv: {
        ok: arxiv.ok,
        count: arxiv.items.length,
        error: arxiv.error,
        status: arxiv.status,
      },
      accelerator: {
        ok: accel.ok,
        count: accel.items.length,
        error: accel.error,
        status: accel.status,
      },
      hackathon: {
        ok: hacks.ok,
        count: hacks.items.length,
        error: hacks.error,
        status: hacks.status,
      },
    },
  };
}

export async function ingestAsFounderDrafts(): Promise<{
  items: NormalizedIngestItem[];
  drafts: IngestDraft[];
  sources: IngestSourcesMap;
}> {
  const { items, sources } = await ingestAllSourcesDetailed();
  const drafts = itemsToFounderDrafts(items);
  return { items, drafts, sources };
}

export { itemsToFounderDrafts };
export type { IngestDraft };
