/**
 * Shared sector matching for first-pass, thesis-fit, and 3-axis scoring.
 * Substring + token + light synonym expansion so "SaaS" hits "enterprise SaaS"
 * and "AI marketing" can soft-hit AI-adjacent thesis labels.
 */

const SYNONYMS: Record<string, string[]> = {
  ai: ["ai", "artificial", "intelligence", "ml", "llm", "agentic", "agent", "agents"],
  infra: ["infra", "infrastructure", "platform", "devtools", "developer", "tools", "api"],
  saas: ["saas", "software", "b2b", "enterprise"],
  marketing: ["marketing", "martech", "growth", "gtm", "go-to-market", "brand"],
  agentic: ["agentic", "agent", "agents", "autonomous"],
  enterprise: ["enterprise", "b2b", "saas"],
  developer: ["developer", "devtools", "dev", "tools", "platform", "api"],
};

function tokens(s: string): Set<string> {
  const raw = s
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 2);
  const out = new Set<string>();
  for (const t of raw) {
    out.add(t);
    for (const [canon, alts] of Object.entries(SYNONYMS)) {
      if (alts.includes(t) || t === canon) {
        out.add(canon);
        for (const a of alts) out.add(a);
      }
    }
  }
  return out;
}

/** True when product sector is in / overlaps fund thesis sectors. */
export function sectorMatchesThesis(
  productSector: string | undefined | null,
  thesisSectors: string[] | undefined | null,
): boolean {
  if (!thesisSectors?.length) return true;
  if (!productSector?.trim()) return false;

  const ps = productSector.trim().toLowerCase();
  // Direct substring either way (legacy behavior).
  if (
    thesisSectors.some(
      (t) => ps.includes(t.toLowerCase()) || t.toLowerCase().includes(ps),
    )
  ) {
    return true;
  }

  const productTokens = tokens(ps);
  // Meaningful overlap: ignore ultra-generic single tokens unless both sides share 2+.
  const GENERIC = new Set(["software", "tech", "platform", "tools"]);
  for (const t of thesisSectors) {
    const thesisTokens = tokens(t);
    let shared = 0;
    let sharedNonGeneric = 0;
    for (const tok of productTokens) {
      if (thesisTokens.has(tok)) {
        shared += 1;
        if (!GENERIC.has(tok)) sharedNonGeneric += 1;
      }
    }
    if (sharedNonGeneric >= 1 || shared >= 2) return true;
  }
  return false;
}
