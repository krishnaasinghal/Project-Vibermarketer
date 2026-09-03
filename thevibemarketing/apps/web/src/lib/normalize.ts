import type { Claim, Founder, Product } from "@vibe/engine";

export function linksToArray(
  links: string[] | Record<string, string | undefined> | undefined,
): string[] {
  if (!links) return [];
  if (Array.isArray(links)) return links.filter(Boolean);
  return Object.values(links).filter((v): v is string => Boolean(v));
}

export function toClaims(
  raw: Array<string | Pick<Claim, "text" | "category"> | Claim> | undefined,
): Claim[] {
  if (!raw?.length) return [];
  return raw.map((c) => {
    if (typeof c === "string") {
      return {
        text: c,
        category: "traction",
        confidence: 0.55,
        contradiction: false,
      };
    }
    return {
      text: c.text,
      category: c.category || "traction",
      evidence_url: "evidence_url" in c ? c.evidence_url : undefined,
      confidence: "confidence" in c && typeof c.confidence === "number" ? c.confidence : 0.55,
      contradiction:
        "contradiction" in c && typeof c.contradiction === "boolean"
          ? c.contradiction
          : false,
      contradiction_note:
        "contradiction_note" in c ? c.contradiction_note : undefined,
    };
  });
}

// Do not re-export value symbols from @vibe/engine here — client pages import
// emptyGravity and Turbopack would pull MemoryStore → node:fs/promises.

export function emptyGravity(): Founder["gravity"] {
  return {
    gravity_score: 0,
    confidence: 0,
    components: {
      velocity: 0,
      pull_ratio: 0,
      cadence: 0,
      stars: 0,
      forks: 0,
      hn_points: 0,
      followers: 0,
      engagement: 0,
      post_count: 0,
      shipping_events: 0,
      audience: 1,
      external_engagement: 0,
      own_output: 1,
    },
    evidence: [],
    abstain: true,
    abstain_reason: "Not yet scored",
  };
}

export function normalizeProduct(
  raw: Partial<Product> & { name: string; founder_id: string },
): Product {
  return {
    id: raw.id ?? `p_${raw.founder_id}`,
    founder_id: raw.founder_id,
    name: raw.name,
    domain: raw.domain,
    oneliner: raw.oneliner,
    sector: raw.sector,
    stage: raw.stage,
    traction_claims: toClaims(
      raw.traction_claims as Array<string | Claim> | undefined,
    ),
  };
}
