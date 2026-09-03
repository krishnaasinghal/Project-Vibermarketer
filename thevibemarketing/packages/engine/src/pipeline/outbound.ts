/**
 * Outbound sourcing topography — measure distribution gravity inputs.
 * Map (cheap) → markdown scrape → optional OpenAI extract under untrusted prompt.
 * Does NOT run Firecrawl JSON extract by default (wallet drain).
 */

import { completeJson } from "../adapters/openai";
import { discoverThenScrapeMarkdown } from "../connectors/firecrawl";
import {
  UNTRUSTED_SCRAPE_SYSTEM,
  buildUntrustedExtractUser,
} from "../prompts/untrusted-scrape";

export type OutboundFounderExtract = {
  name: string | null;
  currentRole: string | null;
  githubProfile: string | null;
  productOneLiner: string | null;
  claimedUsers: number | null;
  claimedArr: number | null;
  evidenceSnippets: string[];
};

const SCHEMA_HINT = `{
  "name": string|null,
  "currentRole": string|null,
  "githubProfile": string|null,
  "productOneLiner": string|null,
  "claimedUsers": number|null,
  "claimedArr": number|null,
  "evidenceSnippets": string[]
}`;

export type OutboundSourcingResult = {
  ok: boolean;
  primaryUrl: string;
  targets: string[];
  creditsHint: string;
  markdownChars: number;
  founder: OutboundFounderExtract | null;
  provenance: string;
  note: string;
};

export async function processOutboundSourcing(
  domainUrl: string,
): Promise<OutboundSourcingResult> {
  const disc = await discoverThenScrapeMarkdown(domainUrl);
  if (!disc.markdown) {
    return {
      ok: false,
      primaryUrl: disc.primaryUrl,
      targets: disc.targets,
      creditsHint: disc.creditsHint,
      markdownChars: 0,
      founder: null,
      provenance: disc.primaryUrl,
      note: disc.error || "No markdown — check FIRECRAWL_API_KEY or domain",
    };
  }

  const extracted = await completeJson(
    buildUntrustedExtractUser(disc.markdown, SCHEMA_HINT),
    SCHEMA_HINT,
    { system: UNTRUSTED_SCRAPE_SYSTEM },
  );

  let founder: OutboundFounderExtract | null = null;
  if (extracted && typeof extracted === "object") {
    const o = extracted as Record<string, unknown>;
    founder = {
      name: typeof o.name === "string" ? o.name : null,
      currentRole: typeof o.currentRole === "string" ? o.currentRole : null,
      githubProfile:
        typeof o.githubProfile === "string" ? o.githubProfile : null,
      productOneLiner:
        typeof o.productOneLiner === "string" ? o.productOneLiner : null,
      claimedUsers:
        typeof o.claimedUsers === "number" ? o.claimedUsers : null,
      claimedArr: typeof o.claimedArr === "number" ? o.claimedArr : null,
      evidenceSnippets: Array.isArray(o.evidenceSnippets)
        ? o.evidenceSnippets.filter((x): x is string => typeof x === "string")
        : [],
    };
  }

  return {
    ok: true,
    primaryUrl: disc.primaryUrl,
    targets: disc.targets,
    creditsHint: disc.creditsHint,
    markdownChars: disc.markdown.length,
    founder,
    provenance: disc.primaryUrl,
    note: founder
      ? "Map→markdown→OpenAI extract (untrusted container). Scores stay deterministic elsewhere."
      : "Markdown scraped; OpenAI extract skipped or failed — heuristics can use raw markdown.",
  };
}
