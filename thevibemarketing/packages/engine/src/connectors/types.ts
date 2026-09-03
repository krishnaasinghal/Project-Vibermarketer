export type NormalizedIngestItem = {
  source:
    | "github"
    | "hackernews"
    | "producthunt"
    | "arxiv"
    | "accelerator"
    | "hackathon";
  external_id: string;
  title: string;
  author: string;
  url: string;
  observed_at: string;
  metrics: Record<string, number>;
  raw: unknown;
};
