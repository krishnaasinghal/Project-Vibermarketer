import type { Founder, Product } from "../types";

/**
 * Deterministic multi-query plan for deep diligence.
 * Seeds from profile socials/handles so Tavily/Firecrawl can find real pages.
 * No LLM — judges can audit every query string.
 */
export function planResearchQueries(
  founder: Founder,
  product?: Product | null,
): string[] {
  const name = founder.name.trim();
  const company = (product?.name ?? name).trim();
  const sector = product?.sector?.trim();
  const domain = product?.domain?.trim();
  const gh = founder.handles.github?.replace(/^@/, "").trim();
  const tw = (founder.handles.twitter ?? founder.handles.x)?.replace(/^@/, "").trim();
  const li = founder.handles.linkedin?.replace(/^@/, "").trim();
  const hn = founder.handles.hn?.replace(/^@/, "").trim();
  const oneliner = product?.oneliner?.trim();
  const siteFromLinks = (founder.links ?? []).find((l) =>
    /^https?:\/\//i.test(l) && !/github\.com/i.test(l),
  );

  const queries = [
    `"${name}" founder ${company}`,
    `${company} ${sector ?? "startup"} funding OR raised OR seed OR launch`,
    `${company} competitors OR alternative OR vs`,
    oneliner
      ? `${company} ${oneliner.slice(0, 80)}`
      : `${name} ${company} product launch`,
  ];

  if (domain) {
    queries.push(
      `site:${domain.replace(/^https?:\/\//i, "").replace(/\/$/, "")} about OR team OR product`,
    );
  } else if (siteFromLinks) {
    try {
      const host = new URL(siteFromLinks).hostname.replace(/^www\./, "");
      queries.push(`site:${host} about OR team`);
    } catch {
      /* ignore */
    }
  }
  if (gh) queries.push(`site:github.com/${gh}`, `${gh} github ${company}`);
  if (tw) queries.push(`site:x.com/${tw} OR site:twitter.com/${tw}`);
  if (li) {
    const slug = li.includes("linkedin.com")
      ? li
      : `linkedin.com/in/${li.replace(/^in\//, "")}`;
    queries.push(`site:${slug.replace(/^https?:\/\//, "")}`);
  }
  if (hn) queries.push(`site:news.ycombinator.com ${hn} OR "${name}"`);

  // Dedupe + hard cap
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const key = q.toLowerCase();
    if (seen.has(key) || !q.trim()) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 8) break;
  }
  return out;
}
