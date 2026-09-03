import type { MemoryStore } from "../memory/store";
import { step } from "../trace";
import type { Founder, Product, Signal } from "../types";
import { collectResearchEvidence } from "./collect";
import { planResearchQueries } from "./plan";
import { synthesizeResearch } from "./synthesize";
import type { ResearchDossier } from "./types";

export type DeepResearchOpts = {
  founder: Founder;
  product?: Product | null;
  signals: Signal[];
  run_id: string;
  store: MemoryStore;
  /** Global budget ms (default 55s). */
  budgetMs?: number;
  maxScrapes?: number;
};

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

/**
 * Deep diligence orchestration:
 * plan → fan-out (Tavily · Firecrawl · E2B · Memory) → cite-only synthesize → dossier.
 * Partial results are OK — never invent facts for a $100K lean.
 */
export async function runDeepResearch(
  opts: DeepResearchOpts,
): Promise<ResearchDossier> {
  const t0 = Date.now();
  const budgetMs = opts.budgetMs ?? 55_000;
  const { founder, product, signals, run_id, store } = opts;

  const queries = planResearchQueries(founder, product);
  await step(
    run_id,
    "deep_research_plan",
    { founder_id: founder.id, queries: queries.length },
    { queries },
    queries,
    store,
  );

  const collected = await withBudget(
    collectResearchEvidence({
      queries,
      founder,
      product,
      signals,
      maxScrapes: opts.maxScrapes ?? 3,
    }),
    Math.min(budgetMs - 8_000, 48_000),
  );

  if (!collected) {
    const dossier: ResearchDossier = {
      founder_id: founder.id,
      run_id,
      queries,
      raw_hits: [],
      scrapes: [],
      findings: [],
      open_questions: [
        "Deep research collection timed out — retry or check API keys",
      ],
      provider_status: {
        tavily: "timeout",
        firecrawl: "timeout",
        e2b: "timeout",
        signal: signals.length > 0 ? "ok" : "skipped",
      },
      partial: true,
      latency_ms: Date.now() - t0,
      synthesized_at: new Date().toISOString(),
      synthesis: "skipped",
    };
    await step(
      run_id,
      "deep_research_collect",
      { founder_id: founder.id },
      { partial: true, timeout: true },
      ["Collection budget exceeded"],
      store,
    );
    return dossier;
  }

  await step(
    run_id,
    "deep_research_collect",
    {
      founder_id: founder.id,
      hits: collected.hits.length,
      scrapes: collected.scrapes.filter((s) => s.ok).length,
    },
    {
      provider_status: collected.provider_status,
      e2b_sandbox_id: collected.e2b_sandbox_id,
      sample_urls: collected.hits
        .filter((h) => /^https?:\/\//i.test(h.url))
        .slice(0, 6)
        .map((h) => h.url),
    },
    collected.hits.slice(0, 8).map((h) => `[${h.provider}] ${h.title}: ${h.url}`),
    store,
  );

  const remaining = Math.max(4_000, budgetMs - (Date.now() - t0));
  const synth = await withBudget(
    synthesizeResearch({
      founder,
      product,
      hits: collected.hits,
    }),
    remaining,
  );

  const synthesis = synth ?? {
    findings: [],
    open_questions: ["Synthesis unavailable — using raw hits only"],
    synthesis: "skipped" as const,
  };

  const partial =
    Object.values(collected.provider_status).some(
      (s) => s === "failed" || s === "timeout" || s === "skipped",
    ) ||
    synthesis.synthesis !== "openai" ||
    synthesis.findings.length === 0;

  const dossier: ResearchDossier = {
    founder_id: founder.id,
    run_id,
    queries,
    raw_hits: collected.hits,
    scrapes: collected.scrapes,
    findings: synthesis.findings,
    open_questions: synthesis.open_questions,
    provider_status: collected.provider_status,
    partial,
    latency_ms: Date.now() - t0,
    synthesized_at: new Date().toISOString(),
    synthesis: synthesis.synthesis,
  };

  await step(
    run_id,
    "deep_research_synthesize",
    {
      founder_id: founder.id,
      findings: dossier.findings.length,
      synthesis: dossier.synthesis,
      partial: dossier.partial,
    },
    {
      open_questions: dossier.open_questions,
      findings: dossier.findings.map((f) => ({
        claim: f.claim,
        topic: f.topic,
        support: f.support,
        citations: f.citations.length,
        confidence: f.confidence,
      })),
    },
    [
      ...dossier.findings.slice(0, 5).map((f) => `${f.support}: ${f.claim}`),
      ...dossier.open_questions.slice(0, 3).map((q) => `Q: ${q}`),
    ],
    store,
  );

  // Persist as Memory signals for later screens / memos
  for (const f of dossier.findings.slice(0, 8)) {
    await store.addSignal({
      entity_type: "founder",
      entity_id: founder.id,
      source: "deep_research",
      url: f.citations[0]?.url,
      payload: {
        finding_id: f.id,
        claim: f.claim,
        topic: f.topic,
        support: f.support,
        confidence: f.confidence,
        citations: f.citations,
        run_id,
      },
      observed_at: dossier.synthesized_at,
    });
  }

  return dossier;
}
