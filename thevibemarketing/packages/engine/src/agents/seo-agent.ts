/**
 * SEO agent — keyword opportunities + long-form blog draft for HITL.
 * Uses Tavily when available; falls back to brand pillars only.
 */

import { completeJsonDetailed } from "../adapters/openai";
import { tavilySearch } from "../connectors/tavily";
import {
  recallBrandMemory,
  type BrandMemoryInput,
} from "../memory/brand-memory";
import {
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
} from "../prompts/untrusted-scrape";

export type SeoKeyword = {
  keyword: string;
  intent: "informational" | "commercial" | "navigational" | "transactional";
  why: string;
  difficulty: "low" | "medium" | "high";
};

export type SeoBlogDraft = {
  title: string;
  slug: string;
  meta_description: string;
  outline: string[];
  body_markdown: string;
  primary_keyword: string;
  secondary_keywords: string[];
};

export type SeoAgentResult = {
  ok: boolean;
  keywords: SeoKeyword[];
  draft: SeoBlogDraft | null;
  research_used: "tavily" | "brand_only";
  error?: string;
  note: string;
};

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "post"
  );
}

/**
 * Research keyword opportunities and draft one SEO post for HITL approval.
 */
export async function runSeoAgent(opts: {
  brand: BrandMemoryInput;
  ownerId: string;
  /** Optional focus topic */
  topic?: string;
}): Promise<SeoAgentResult> {
  const brand = opts.brand;
  const topic =
    opts.topic?.trim() ||
    brand.pillars[0] ||
    brand.oneliner.split(/[.!?]/)[0] ||
    brand.name;

  let researchBlock = "";
  let research_used: "tavily" | "brand_only" = "brand_only";

  const tavily = await tavilySearch(
    `${topic} ${brand.icp} SaaS marketing guide`,
    { maxResults: 6, searchDepth: "basic" },
  );
  if (tavily.ok && tavily.results.length) {
    research_used = "tavily";
    researchBlock = tavily.results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.slice(0, 280)}`,
      )
      .join("\n");
    if (tavily.answer) {
      researchBlock = `Summary: ${tavily.answer}\n\n${researchBlock}`;
    }
  }

  const recall = await recallBrandMemory({
    brandName: brand.name,
    ownerId: opts.ownerId,
    brand,
    task: "campaign",
  });

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      keywords: [],
      draft: null,
      research_used,
      error:
        "OPENAI_API_KEY required for SEO drafts. We refuse template long-form.",
      note: "Fail closed — no offline slop drafts.",
    };
  }

  const schema = `{
  "keywords": [
    { "keyword": string, "intent": "informational"|"commercial"|"navigational"|"transactional", "why": string, "difficulty": "low"|"medium"|"high" }
  ],
  "draft": {
    "title": string,
    "slug": string,
    "meta_description": string,
    "outline": string[],
    "body_markdown": string,
    "primary_keyword": string,
    "secondary_keywords": string[]
  }
}`;

  const user = `Brand:
name=${brand.name}
oneliner=${brand.oneliner}
icp=${brand.icp}
tone=${brand.tone}
pillars=${brand.pillars.join(", ")}
url=${brand.url}

Memory:
${recall.contextLines.join("\n")}

Focus topic: ${topic}

${researchBlock ? wrapUntrustedScrapedData(researchBlock) : "(no web research — use brand only)"}

Produce 5–8 keyword opportunities and ONE long-form blog draft in markdown (800–1400 words).
Rules:
- Helpful for the ICP; no fake metrics or invented customers
- Include H2 structure; natural primary keyword use
- meta_description ≤ 155 chars
- body_markdown must be real article body, not outline only
- Match brand tone`;

  const parsed = await completeJsonDetailed(user, schema, {
    system: `${UNTRUSTED_SCRAPE_SYSTEM}\nYou are the SEO agent for vibemarketer. Output JSON only for HITL review.`,
  });

  if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") {
    return {
      ok: false,
      keywords: [],
      draft: null,
      research_used,
      error: parsed.ok ? "invalid model output" : parsed.error,
      note: "SEO agent model call failed",
    };
  }

  const data = parsed.data as {
    keywords?: unknown[];
    draft?: Record<string, unknown>;
  };

  const keywords: SeoKeyword[] = [];
  for (const k of data.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const o = k as Record<string, unknown>;
    const keyword = typeof o.keyword === "string" ? o.keyword.trim() : "";
    if (!keyword) continue;
    const intent = o.intent as SeoKeyword["intent"];
    keywords.push({
      keyword,
      intent:
        intent === "commercial" ||
        intent === "navigational" ||
        intent === "transactional"
          ? intent
          : "informational",
      why: typeof o.why === "string" ? o.why : "",
      difficulty:
        o.difficulty === "low" || o.difficulty === "high"
          ? o.difficulty
          : "medium",
    });
  }

  const d = data.draft || {};
  const title = typeof d.title === "string" ? d.title.trim() : "";
  const body =
    typeof d.body_markdown === "string" ? d.body_markdown.trim() : "";
  if (!title || !body) {
    return {
      ok: false,
      keywords,
      draft: null,
      research_used,
      error: "model returned incomplete draft",
      note: "SEO keywords may exist but draft incomplete",
    };
  }

  const draft: SeoBlogDraft = {
    title,
    slug:
      typeof d.slug === "string" && d.slug.trim()
        ? slugify(d.slug)
        : slugify(title),
    meta_description:
      typeof d.meta_description === "string"
        ? d.meta_description.slice(0, 160)
        : brand.oneliner.slice(0, 155),
    outline: Array.isArray(d.outline)
      ? d.outline.filter((x): x is string => typeof x === "string").slice(0, 12)
      : [],
    body_markdown: body,
    primary_keyword:
      typeof d.primary_keyword === "string"
        ? d.primary_keyword
        : keywords[0]?.keyword || topic,
    secondary_keywords: Array.isArray(d.secondary_keywords)
      ? d.secondary_keywords
          .filter((x): x is string => typeof x === "string")
          .slice(0, 8)
      : [],
  };

  return {
    ok: true,
    keywords: keywords.slice(0, 10),
    draft,
    research_used,
    note: `SEO draft ready for HITL · research=${research_used}`,
  };
}
