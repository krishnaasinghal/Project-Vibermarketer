import {
  completeJsonDetailed,
  discoverThenScrapeMarkdown,
  syncBrandMemory,
  tavilySearch,
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
  type BrandFact,
} from "@vibe/engine";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  currentOwnerId,
  toBrandMemoryInput,
} from "@/lib/brand-memory-context";
import {
  checkMarketingExpensiveLimit,
  recordGeneration,
} from "@/lib/marketing-approve";
import { getMarketingStore, type BrandContext } from "@/lib/marketing-store";
import { normalizeHttpUrl } from "@/lib/url";
import { withMarketingStore } from "@/lib/with-marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

function factId(parts: Array<string | null | undefined>): string {
  return createHash("sha1")
    .update(parts.filter(Boolean).join("|").toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function normalizeExtractedFacts(
  raw: unknown,
  evidenceUrl: string,
): BrandFact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): BrandFact | null => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const label = String(obj.label || obj.claim_type || "").trim();
      const value = String(obj.value || obj.claim || "").trim();
      if (!label || !value) return null;
      return {
        id: factId(["firecrawl", evidenceUrl, label, value]),
        label: label.slice(0, 80),
        value: value.slice(0, 500),
        source: "firecrawl",
        evidence_url: evidenceUrl,
        confidence: normalizeConfidence(obj.confidence),
        status: "pending",
        note: "Extracted from the submitted site; verify before treating as durable truth.",
      };
    })
    .filter((fact): fact is BrandFact => Boolean(fact))
    .slice(0, 24);
}

async function researchBrandFacts(brand: {
  name: string;
  url: string;
  oneliner: string;
  competitors?: string[];
}): Promise<{ facts: BrandFact[]; ok: boolean; error?: string }> {
  const host = (() => {
    try {
      return new URL(brand.url).hostname.replace(/^www\./, "");
    } catch {
      return brand.url;
    }
  })();
  const queries = [
    `"${brand.name}" ${host} product`,
    `"${brand.name}" competitors alternatives`,
    `"${brand.name}" ${brand.oneliner}`,
  ];
  const facts: BrandFact[] = [];
  let lastError: string | undefined;
  for (const query of queries) {
    const result = await tavilySearch(query, {
      maxResults: 3,
      searchDepth: "basic",
    });
    if (!result.ok) {
      lastError = result.error;
      continue;
    }
    for (const hit of result.results) {
      if (!hit.url || hit.url.includes("vibemarketer.fun")) continue;
      facts.push({
        id: factId(["tavily", query, hit.url, hit.title]),
        label: "web_research",
        value: `${hit.title}: ${hit.content}`.slice(0, 500),
        source: "tavily",
        evidence_url: hit.url,
        confidence: hit.score ?? null,
        status: "pending",
        note: `Relevant web search: ${query}`,
      });
    }
  }
  const deduped = Array.from(new Map(facts.map((f) => [f.id, f])).values());
  return { facts: deduped.slice(0, 12), ok: deduped.length > 0, error: lastError };
}

export async function GET() {
  return withMarketingStore(async () => {
    const store = getMarketingStore();
    const brand = await store.getBrand();
    return NextResponse.json({ brand });
  });
}

/**
 * POST { url } — Firecrawl map→markdown followed by a live structured model extraction.
 * Never runs Firecrawl JSON extract here (wallet protection).
 * Bare domains (kaggleingest.com) are accepted.
 */
export async function POST(req: Request) {
  return withMarketingStore(async () => {
  try {
    const limited = await checkMarketingExpensiveLimit(
      currentOwnerId(),
      "brand",
    );
    if (!limited.ok) return limited.response;

    const body = (await req.json()) as { url?: string };
    const url = normalizeHttpUrl(String(body.url || ""));
    if (!url) {
      return NextResponse.json(
        { error: "url required (e.g. https://example.com or example.com)" },
        { status: 400 },
      );
    }

    const disc = await discoverThenScrapeMarkdown(url);
    if (!disc.markdown) {
      return NextResponse.json(
        { error: "Live Firecrawl extraction is required to build brand memory. Check the Firecrawl key and the target URL." },
        { status: 502 },
      );
    }

    const schema = `{
  "name": string,
  "oneliner": string,
  "description": string,
  "icp": string,
  "tone": string,
  "pillars": [string, string, string],
  "competitors": string[],
  "facts": [
    {
      "label": string,
      "value": string,
      "confidence": number
    }
  ]
}`;
    const extracted = await completeJsonDetailed(
      `${wrapUntrustedScrapedData(disc.markdown)}\n\nExtract a concise, evidence-grounded brand profile for ${disc.primaryUrl || url}. Include a 2–4 sentence product description for a CMO dashboard, up to 5 competitor domains/names if mentioned, and 5–12 concrete brand facts visible in the source. Do not invent customers, traction, integrations, or claims not present in the source.`,
      schema,
      { system: `${UNTRUSTED_SCRAPE_SYSTEM}\nReturn JSON only matching the schema.` },
    );
    if (!extracted.ok || !extracted.data || typeof extracted.data !== "object") {
      return NextResponse.json(
        { error: `Live model extraction failed: ${extracted.ok ? "invalid model output" : extracted.error}` },
        { status: 502 },
      );
    }
    const profile = extracted.data as Partial<BrandContext>;
    const pillars = Array.isArray(profile.pillars)
      ? profile.pillars.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 6)
      : [];
    if (
      typeof profile.name !== "string" || !profile.name.trim() ||
      typeof profile.oneliner !== "string" || !profile.oneliner.trim() ||
      typeof profile.icp !== "string" || !profile.icp.trim() ||
      typeof profile.tone !== "string" || !profile.tone.trim() ||
      pillars.length === 0
    ) {
      return NextResponse.json(
        { error: "Live model extraction returned an incomplete brand profile." },
        { status: 502 },
      );
    }
    const competitors = Array.isArray(
      (profile as { competitors?: unknown }).competitors,
    )
      ? ((profile as { competitors: unknown[] }).competitors
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8) as string[])
      : [];
    const descriptionRaw = (profile as { description?: unknown }).description;
    const description =
      typeof descriptionRaw === "string" && descriptionRaw.trim()
        ? descriptionRaw.trim().slice(0, 1200)
        : profile.oneliner.trim();
    const extractedFacts = normalizeExtractedFacts(
      (profile as { facts?: unknown }).facts,
      disc.primaryUrl || url,
    );
    const draft = {
      url: disc.primaryUrl || url,
      name: profile.name.trim(),
      oneliner: profile.oneliner.trim(),
      description,
      icp: profile.icp.trim(),
      tone: profile.tone.trim(),
      pillars,
      competitors: competitors.length ? competitors : undefined,
    };
    const research = await researchBrandFacts(draft);
    const facts = [
      ...extractedFacts,
      ...research.facts.filter(
        (fact) => !extractedFacts.some((existing) => existing.id === fact.id),
      ),
    ].slice(0, 40);

    const ownerId = currentOwnerId();
    const memory = await syncBrandMemory(
      toBrandMemoryInput({ ...draft, facts }, { markdown: disc.markdown }),
      { ownerId },
    );
    if (!memory.factsOk || !memory.documentOk) {
      const failedLayers = [
        !memory.factsOk ? "semantic facts" : null,
        !memory.documentOk ? "site document" : null,
      ].filter(Boolean).join(" and ");
      return NextResponse.json(
        {
          error: `Live Supermemory sync failed for ${failedLayers}: ${memory.error || "indexing was not confirmed"}`,
          supermemory: memory,
        },
        { status: 502 },
      );
    }
    const store = getMarketingStore();
    const brand = await store.setBrand({
      ...draft,
      facts,
      memory: {
        container_tag: memory.containerTag,
        last_synced_at: new Date().toISOString(),
        fact_count: memory.factCount,
      },
    });

    const meter = await recordGeneration("brand");

    return NextResponse.json({
      brand,
      firecrawl: true,
      primaryUrl: disc.primaryUrl,
      mappedTargets: disc.targets.slice(0, 6),
      creditsHint: disc.creditsHint,
      research: {
        provider: "tavily",
        ok: research.ok,
        fact_count: research.facts.length,
        error: research.error,
      },
      facts: {
        pending: facts.filter((fact) => fact.status === "pending").length,
        verified: facts.filter((fact) => fact.status === "verified").length,
        rejected: facts.filter((fact) => fact.status === "rejected").length,
      },
      supermemory: memory,
      meter: { used: meter.used, limit: meter.limit, remaining: meter.remaining },
      architecture: {
        source_of_truth: "marketing_state.brand",
        retrieval: "supermemory",
        container: memory.containerTag,
        layers: memory.layers,
      },
      note: `Brand SoT saved + retrieval index synced (${memory.factCount} semantic facts → ${memory.containerTag}).`,
    });
  } catch (e) {
    const { reportError } = await import("@/lib/errors");
    await reportError("api/brand", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "brand extract failed" },
      { status: 500 },
    );
  }
  });
}
