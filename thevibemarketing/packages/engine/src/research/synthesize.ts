import { randomUUID } from "node:crypto";
import { completeJsonDetailed } from "../adapters/openai";
import {
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
} from "../prompts/untrusted-scrape";
import type { Founder, Product } from "../types";
import type { ResearchFinding, ResearchHit } from "./types";

export type SynthesizeResult = {
  findings: ResearchFinding[];
  open_questions: string[];
  synthesis: "openai" | "skipped";
};

function unavailable(reason: string): SynthesizeResult {
  return { findings: [], open_questions: [reason], synthesis: "skipped" };
}

/**
 * Cite-only synthesis. OpenAI may rephrase evidence; it must not invent URLs or metrics.
 * No heuristic result is produced when the live model is unavailable.
 */
export async function synthesizeResearch(opts: {
  founder: Founder;
  product?: Product | null;
  hits: ResearchHit[];
}): Promise<SynthesizeResult> {
  const { founder, product, hits } = opts;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return unavailable("Live research synthesis is unavailable: OPENAI_API_KEY is not configured.");
  }
  if (hits.length === 0) {
    return unavailable("Live research synthesis is unavailable: no verified source material was collected.");
  }

  const packed = hits
    .slice(0, 18)
    .map(
      (h, i) =>
        `[${i}] provider=${h.provider} query=${h.query}\nurl=${h.url}\ntitle=${h.title}\nexcerpt=${h.excerpt.slice(0, 320)}`,
    )
    .join("\n\n");

  const schema = `{
  "findings": [
    {
      "claim": string,
      "topic": "founder"|"product"|"market"|"competition"|"traction"|"risk",
      "support": "supported"|"unsupported"|"unknown",
      "citation_indexes": number[],
      "confidence": number
    }
  ],
  "open_questions": string[]
}`;

  const user = `${wrapUntrustedScrapedData(packed)}

Founder (trusted labels only — do not invent bio/metrics):
name=${founder.name}
product=${product?.name ?? "n/a"}
oneliner=${product?.oneliner ?? "n/a"}
sector=${product?.sector ?? "n/a"}
domain=${product?.domain ?? "n/a"}

Task: Produce 3–7 diligence findings for a $100K check decision-support memo.
RULES:
- Every finding MUST cite citation_indexes into the packed sources above.
- Never invent URLs, funding amounts, user counts, or competitors not present in excerpts.
- If evidence is missing, put it in open_questions with support unknown — do not guess.
- Reply JSON only.`;

  try {
    const parsed = await completeJsonDetailed(user, schema, {
      system: `${UNTRUSTED_SCRAPE_SYSTEM}

You are a VC diligence synthesizer. Cite only. Prefer "unknown" over hallucination.`,
    });
    if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") {
      return unavailable("Live research synthesis returned an invalid response.");
    }
    const data = parsed.data as {
      findings?: unknown[];
      open_questions?: unknown[];
    };
    if (!Array.isArray(data.findings) || data.findings.length === 0) {
      return unavailable("Live research synthesis returned no cite-bound findings.");
    }

    const findings: ResearchFinding[] = [];
    for (const raw of data.findings.slice(0, 8)) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const claim = typeof o.claim === "string" ? o.claim.trim() : "";
      if (!claim) continue;
      const indexes = Array.isArray(o.citation_indexes)
        ? o.citation_indexes.filter((n): n is number => typeof n === "number")
        : [];
      const citations = indexes
        .map((i) => hits[i])
        .filter(Boolean)
        .slice(0, 4)
        .map((h) => ({
          url: h!.url,
          snippet: h!.excerpt.slice(0, 160),
          source: h!.provider,
        }));
      if (citations.length === 0) continue;
      const topicRaw = String(o.topic ?? "risk");
      const topics = [
        "founder",
        "product",
        "market",
        "competition",
        "traction",
        "risk",
      ] as const;
      const topic = (
        topics as readonly string[]
      ).includes(topicRaw)
        ? (topicRaw as ResearchFinding["topic"])
        : "risk";
      const supportRaw = String(o.support ?? "unknown");
      findings.push({
        id: `rf_${randomUUID().slice(0, 8)}`,
        claim,
        topic,
        support:
          supportRaw === "supported" || supportRaw === "unsupported"
            ? supportRaw
            : "unknown",
        citations,
        confidence:
          typeof o.confidence === "number"
            ? Math.min(1, Math.max(0, o.confidence))
            : 0.5,
      });
    }

    if (findings.length === 0) {
      return unavailable("Live research synthesis returned no valid cited findings.");
    }

    const open_questions = Array.isArray(data.open_questions)
      ? data.open_questions
          .filter((q): q is string => typeof q === "string")
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];

    return {
      findings,
      open_questions,
      synthesis: "openai",
    };
  } catch {
    return unavailable("Live research synthesis failed. Retry after the provider is healthy.");
  }
}
