import type { Founder } from "@vibe/engine";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/^@/, "");
}

type FounderLookup = {
  getFounder(id: string): Promise<Founder | undefined>;
  listFounders(): Promise<Founder[]>;
};

/**
 * Resolve a founder by exact id, github handle, display name, or
 * live_* source prefixes (radar sometimes shows the short handle only).
 */
export async function resolveFounder(
  store: FounderLookup,
  rawId: string,
): Promise<Founder | undefined> {
  // Next already decodes route params; tolerate single/double encoding + + as space.
  let id = (rawId ?? "").trim();
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  try {
    if (/%[0-9a-f]{2}/i.test(id)) id = decodeURIComponent(id);
  } catch {
    /* keep */
  }
  id = id.replace(/\+/g, " ").trim();
  if (!id) return undefined;

  const exact = await store.getFounder(id);
  if (exact) return exact;

  const key = norm(id);
  // Strip known live_ prefixes if the full id was partially used.
  const bare = key
    .replace(/^live_github_/, "")
    .replace(/^live_hackernews_/, "")
    .replace(/^live_hn_/, "")
    .replace(/^live_arxiv_/, "")
    .replace(/^inbound_/, "");

  const altIds = new Set<string>([
    id,
    key,
    bare,
    `live_github_${id}`,
    `live_github_${key}`,
    `live_github_${bare}`,
    `live_hn_${id}`,
    `live_hn_${key}`,
    `live_hn_${bare}`,
    `live_hackernews_${id}`,
    `live_hackernews_${key}`,
    `live_hackernews_${bare}`,
    `live_arxiv_${id}`,
    `live_arxiv_${key}`,
    `live_arxiv_${bare}`,
    `inbound_${id}`,
    `inbound_${key}`,
  ]);

  const founders = await store.listFounders();
  const found = founders.find((f) => {
    if (altIds.has(f.id) || norm(f.id) === key || norm(f.id) === bare) {
      return true;
    }
    // id suffix match: openclaw → live_github_openclaw
    if (norm(f.id).endsWith(`_${key}`) || norm(f.id).endsWith(`_${bare}`)) {
      return true;
    }
    if (norm(f.name) === key || norm(f.name) === bare) return true;
    // Name slug: "Anand Vashishtha" ↔ anand-vashishtha / anand_vashishtha
    const nameSlug = norm(f.name).replace(/[^a-z0-9]+/g, "-");
    const nameUnderscore = norm(f.name).replace(/[^a-z0-9]+/g, "_");
    if (key === nameSlug || key === nameUnderscore || bare === nameSlug) {
      return true;
    }
    const gh = f.handles?.github ? norm(f.handles.github) : "";
    if (
      gh &&
      (gh === key ||
        gh === bare ||
        f.id === `live_github_${gh}` ||
        norm(f.id) === `live_github_${gh}`)
    ) {
      return true;
    }
    return false;
  });
  if (found) return found;

  // Point-lookup common full ids (DualMemoryStore may hit Postgres on cold instance).
  if (bare) {
    for (const prefix of [
      "live_github_",
      "live_hackernews_",
      "live_hn_",
      "live_arxiv_",
      "inbound_",
    ] as const) {
      const hit = await store.getFounder(`${prefix}${bare}`);
      if (hit) return hit;
    }
  }
  return undefined;
}
