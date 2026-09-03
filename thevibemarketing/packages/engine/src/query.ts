import type { Founder, Product, QueryResult } from './types';

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'with',
  'no',
  'not',
  'for',
  'in',
  'of',
  'to',
  'vs',
  'is',
  'are',
]);

/** Tokenize a multi-attribute NL-ish query into keywords. */
export function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
}

type Filters = {
  geo?: string;
  sector?: string;
  stage?: string;
  technical?: boolean;
  no_vc?: boolean;
  enterprise?: boolean;
  accelerator?: boolean;
};

/**
 * Extract soft filters from phrases like
 * "technical founder, Berlin, AI infra, enterprise traction, no prior VC backing".
 */
export function extractFilters(q: string): Filters {
  const lower = q.toLowerCase();
  const filters: Filters = {};

  if (/\btechnical\b/.test(lower)) filters.technical = true;
  if (/\benterprise\b/.test(lower)) filters.enterprise = true;
  if (/\b(no prior vc|no vc|bootstrapped|unfunded)\b/.test(lower)) filters.no_vc = true;
  if (/\b(accelerator|yc|techstars|entrepreneur first)\b/.test(lower)) filters.accelerator = true;

  const geoHit = lower.match(
    /\b(berlin|london|munich|paris|nyc|new york|sf|san francisco|bay area|remote|eu|europe|us|usa|india|singapore)\b/,
  );
  if (geoHit) filters.geo = geoHit[1];

  const stageHit = lower.match(
    /\b(pre-?seed|seed|series\s*[abc]|idea|mvp|growth|early)\b/,
  );
  if (stageHit) filters.stage = stageHit[1]!.replace(/\s+/g, ' ');

  const sectorHit = lower.match(
    /\b(ai infra|ai infrastructure|devtools?|developer tools?|saas|fintech|healthtech|climate|infra|mlops|security|b2b|b2c)\b/,
  );
  if (sectorHit) filters.sector = sectorHit[1];

  return filters;
}

function haystack(founder: Founder, product?: Product): string {
  return [
    founder.name,
    founder.bio ?? '',
    JSON.stringify(founder.handles),
    founder.links.join(' '),
    founder.claims.map((c) => c.text).join(' '),
    product?.name ?? '',
    product?.oneliner ?? '',
    product?.sector ?? '',
    product?.stage ?? '',
    product?.domain ?? '',
    product?.traction_claims.map((c) => c.text).join(' ') ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

type MatchDetail = {
  score: number;
  matched_terms: string[];
  filter_hits: string[];
};

function scoreMatch(
  text: string,
  terms: string[],
  filters: Filters,
  founder: Founder,
  product?: Product,
): MatchDetail {
  let score = 0;
  const matched_terms: string[] = [];
  const filter_hits: string[] = [];

  for (const t of terms) {
    if (text.includes(t)) {
      score += 2;
      matched_terms.push(t);
    }
  }

  if (filters.sector) {
    const sectorToken = filters.sector.split(' ')[0]!;
    if (product?.sector?.toLowerCase().includes(sectorToken) || text.includes(filters.sector)) {
      score += 5;
      filter_hits.push(`sector:${filters.sector}`);
    }
  }

  if (filters.stage && product?.stage?.toLowerCase().includes(filters.stage)) {
    score += 4;
    filter_hits.push(`stage:${filters.stage}`);
  }
  if (filters.geo && text.includes(filters.geo)) {
    score += 4;
    filter_hits.push(`geo:${filters.geo}`);
  }

  if (filters.technical) {
    if (founder.handles.github || /engineer|technical|cto|builder/.test(text)) {
      score += 3;
      filter_hits.push('technical');
    }
  }
  if (filters.enterprise && /enterprise|b2b/.test(text)) {
    score += 3;
    filter_hits.push('enterprise');
  }
  if (filters.no_vc) {
    if (/no prior vc|bootstrapped|unfunded|angel only/.test(text)) {
      score += 3;
      filter_hits.push('no_vc');
    }
    if (/series [abc]|raised \$|backed by/.test(text)) score -= 4;
  }
  if (filters.accelerator && /yc|techstars|accelerator/.test(text)) {
    score += 3;
    filter_hits.push('accelerator');
  }

  // Tiny founder_score bump only after a real hit — never the sole reason to match.
  if (matched_terms.length > 0 || filter_hits.length > 0) {
    score += founder.founder_score / 100;
  }

  return { score, matched_terms, filter_hits };
}

/**
 * Simple keyword + filter query over founders/products.
 * Supports compound strings without requiring an LLM.
 */
export function queryMemory(
  query: string,
  founders: Founder[],
  products: Product[],
  limit = 20,
): QueryResult & {
  hits: Array<{
    founder: Founder;
    products: Product[];
    score: number;
    matched_terms: string[];
    filter_hits: string[];
  }>;
  filters: Filters;
} {
  const terms = tokenizeQuery(query);
  const filters = extractFilters(query);
  const byFounder = new Map<string, Product[]>();
  for (const p of products) {
    const list = byFounder.get(p.founder_id) ?? [];
    list.push(p);
    byFounder.set(p.founder_id, list);
  }

  const ranked = founders
    .map((f) => {
      const fps = byFounder.get(f.id) ?? [];
      const bestProduct = fps[0];
      let best = scoreMatch(haystack(f, bestProduct), terms, filters, f, bestProduct);
      for (const p of fps.slice(1)) {
        const next = scoreMatch(haystack(f, p), terms, filters, f, p);
        if (next.score > best.score) best = next;
      }
      return { founder: f, products: fps, ...best };
    })
    .filter(
      (r) =>
        r.score > 0.5 &&
        (r.matched_terms.length > 0 || r.filter_hits.length > 0),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    founders: ranked.map((r) => r.founder),
    products: ranked.flatMap((r) => r.products),
    matched_terms: terms,
    filters,
    hits: ranked.map((r) => ({
      founder: r.founder,
      products: r.products,
      score: r.score,
      matched_terms: r.matched_terms,
      filter_hits: r.filter_hits,
    })),
  };
}
