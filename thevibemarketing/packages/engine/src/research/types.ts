/** Deep research dossier — cite-bound evidence for $100K decision-support. */

export type ResearchProvider =
  | "tavily"
  | "firecrawl"
  | "e2b"
  | "signal"
  | "hn"
  | "github";

export type ProviderStatus = "ok" | "skipped" | "failed" | "timeout";

export type ResearchHit = {
  provider: ResearchProvider;
  query: string;
  url: string;
  title: string;
  excerpt: string;
};

export type ResearchScrape = {
  url: string;
  chars: number;
  ok: boolean;
  error?: string;
};

export type ResearchFinding = {
  id: string;
  claim: string;
  topic: "founder" | "product" | "market" | "competition" | "traction" | "risk";
  support: "supported" | "unsupported" | "unknown";
  citations: Array<{
    url: string;
    snippet: string;
    source: ResearchProvider;
  }>;
  confidence: number;
};

export type ResearchDossier = {
  founder_id: string;
  run_id: string;
  queries: string[];
  raw_hits: ResearchHit[];
  scrapes: ResearchScrape[];
  findings: ResearchFinding[];
  open_questions: string[];
  provider_status: Record<string, ProviderStatus>;
  partial: boolean;
  latency_ms: number;
  synthesized_at: string;
  synthesis: "openai" | "skipped";
};
