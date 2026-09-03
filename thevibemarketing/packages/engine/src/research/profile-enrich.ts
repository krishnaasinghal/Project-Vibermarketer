/**
 * Profile-driven public enrichment.
 * Uses handles + links the founder entered (GitHub, site, X, LinkedIn, HN)
 * → real gravity signals via GitHub API · Tavily · Firecrawl · optional E2B.
 * Never invents people or metrics — missing keys skip that provider.
 */

import { fetchUserPublicRepos, parseGithubInput } from "../connectors/github";
import { e2bCodeForensics, e2bHealth } from "../connectors/e2b";
import { mapSite, scrapeMarkdown } from "../connectors/firecrawl";
import { tavilySearch } from "../connectors/tavily";
import type { Founder, Product } from "../types";

export type ProfileSignal = {
  source: string;
  url?: string;
  payload: Record<string, unknown>;
};

export type ProfileEnrichResult = {
  signals: ProfileSignal[];
  providers_used: string[];
  evidence: string[];
  errors: string[];
  github_repo?: string;
};

function cleanHandle(h?: string): string {
  return (h ?? "").trim().replace(/^@/, "");
}

function websiteUrls(founder: Founder, product?: Product | null): string[] {
  const out: string[] = [];
  for (const l of founder.links ?? []) {
    if (/^https?:\/\//i.test(l)) out.push(l);
  }
  if (product?.domain) {
    const d = product.domain.trim();
    out.push(d.startsWith("http") ? d : `https://${d}`);
  }
  return [...new Set(out)].slice(0, 6);
}

function socialSearchQueries(founder: Founder, product?: Product | null): string[] {
  const name = founder.name.trim();
  const company = product?.name?.trim() ?? name;
  const gh = cleanHandle(founder.handles.github);
  const tw = cleanHandle(founder.handles.twitter ?? founder.handles.x);
  const li = cleanHandle(founder.handles.linkedin);
  const hn = cleanHandle(founder.handles.hn);
  const qs: string[] = [
    `"${name}" ${company}`,
    `"${name}" founder OR builder OR startup`,
  ];
  if (gh) qs.push(`site:github.com/${gh}`, `${gh} github stars OR repos`);
  if (tw) qs.push(`site:x.com/${tw} OR site:twitter.com/${tw}`, `"${name}" ${tw}`);
  if (li) {
    const slug = li.includes("linkedin.com")
      ? li
      : `site:linkedin.com/in/${li.replace(/^in\//, "")}`;
    qs.push(slug.includes("site:") ? slug : `site:linkedin.com/in/${li}`, `"${name}" linkedin`);
  }
  if (hn) qs.push(`site:news.ycombinator.com ${hn}`, `"${name}" site:news.ycombinator.com`);
  for (const url of websiteUrls(founder, product).slice(0, 2)) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      qs.push(`site:${host} about OR team OR product`);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(qs)].slice(0, 8);
}

/**
 * Fan-out enrichment from profile fields. Partial OK — never fabricates metrics.
 */
export async function enrichFromProfile(
  founder: Founder,
  product?: Product | null,
): Promise<ProfileEnrichResult> {
  const signals: ProfileSignal[] = [];
  const providers_used: string[] = [];
  const evidence: string[] = [];
  const errors: string[] = [];
  let github_repo: string | undefined;

  const ghRaw = cleanHandle(founder.handles.github);
  const ghParsed = ghRaw
    ? parseGithubInput(ghRaw.includes("/") || ghRaw.includes("github.com") ? ghRaw : ghRaw)
    : null;
  // Also parse links for github
  let owner = ghParsed?.owner;
  let repo = ghParsed?.repo;
  if (!owner) {
    for (const l of founder.links ?? []) {
      const p = parseGithubInput(l);
      if (p?.owner) {
        owner = p.owner;
        repo = p.repo ?? repo;
        break;
      }
    }
  }

  // --- GitHub user + repos (feeds gravity: stars, forks, followers) ---
  if (owner) {
    try {
      const gh = await fetchUserPublicRepos(owner, {
        repo,
        limit: 8,
      });
      if (gh.ok) {
        providers_used.push("github");
        const followers = gh.user?.followers ?? 0;
        evidence.push(
          `GitHub @${gh.user?.login ?? owner}: ${followers} followers · ${gh.items.length} repos`,
        );
        signals.push({
          source: "github",
          url: gh.user?.html_url ?? `https://github.com/${owner}`,
          payload: {
            followers,
            audience: followers,
            post_count: Math.max(1, gh.items.length),
            shipping_events: gh.items.length,
            engagement: followers + gh.items.reduce((n, i) => n + (i.metrics?.stars ?? 0), 0),
            login: gh.user?.login,
          },
        });
        let bestStars = 0;
        let bestForks = 0;
        for (const item of gh.items) {
          const stars = item.metrics?.stars ?? 0;
          const forks = item.metrics?.forks ?? 0;
          bestStars = Math.max(bestStars, stars);
          bestForks = Math.max(bestForks, forks);
          signals.push({
            source: "github",
            url: item.url,
            payload: {
              stars,
              forks,
              stargazers_count: stars,
              forks_count: forks,
              engagement: stars + forks,
              shipping_events: 1,
              title: item.title,
              description: item.raw && typeof item.raw === "object"
                ? (item.raw as { description?: string }).description
                : undefined,
            },
          });
          if (!github_repo && item.title?.includes("/")) {
            github_repo = item.title;
          }
        }
        if (bestStars > 0) {
          evidence.push(`Top public repo stars=${bestStars} forks=${bestForks}`);
        }
        if (!github_repo && owner && repo) github_repo = `${owner}/${repo}`;
        // Prefer highest-star repo for E2B
        const top = [...gh.items].sort(
          (a, b) => (b.metrics?.stars ?? 0) - (a.metrics?.stars ?? 0),
        )[0];
        if (top?.title?.includes("/")) github_repo = top.title;
      } else {
        errors.push(gh.error ?? "GitHub fetch failed");
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "GitHub enrich failed");
    }
  } else {
    evidence.push("No GitHub handle on profile — skip GH gravity pull");
  }

  // --- Tavily social / person search ---
  if (process.env.TAVILY_API_KEY?.trim()) {
    const queries = socialSearchQueries(founder, product);
    try {
      let any = false;
      for (const q of queries.slice(0, 5)) {
        const r = await tavilySearch(q, {
          maxResults: 4,
          searchDepth: "basic",
        });
        if (!r.ok) continue;
        any = true;
        for (const hit of r.results.slice(0, 3)) {
          signals.push({
            source: "tavily",
            url: hit.url,
            payload: {
              title: hit.title,
              excerpt: (hit.content ?? "").slice(0, 500),
              engagement: 2,
              post_count: 1,
              query: q,
            },
          });
          evidence.push(`Tavily: ${hit.title?.slice(0, 80) ?? hit.url}`);
        }
      }
      if (any) providers_used.push("tavily");
      else errors.push("Tavily returned no hits");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Tavily failed");
    }
  } else {
    evidence.push("TAVILY_API_KEY unset — skip web search");
  }

  // --- Firecrawl: scrape profile website + social URLs ---
  if (process.env.FIRECRAWL_API_KEY?.trim()) {
    const targets = websiteUrls(founder, product);
    const tw = cleanHandle(founder.handles.twitter ?? founder.handles.x);
    const li = cleanHandle(founder.handles.linkedin);
    if (tw) targets.push(`https://x.com/${tw}`);
    if (li && li.includes("linkedin.com")) targets.push(li.startsWith("http") ? li : `https://${li}`);
    else if (li) targets.push(`https://www.linkedin.com/in/${li.replace(/^in\//, "")}`);

    let anyFc = false;
    for (const url of [...new Set(targets)].slice(0, 4)) {
      try {
        const md = await scrapeMarkdown(url);
        if (md && md.length > 40) {
          anyFc = true;
          signals.push({
            source: "firecrawl",
            url,
            payload: {
              excerpt: md.slice(0, 2500),
              chars: md.length,
              engagement: 3,
              post_count: 1,
              shipping_events: 1,
            },
          });
          evidence.push(`Firecrawl scrape ${url} (${md.length} chars)`);
        }
      } catch (e) {
        errors.push(
          `Firecrawl ${url}: ${e instanceof Error ? e.message : "failed"}`,
        );
      }
    }
    // Map product domain for deeper pages
    const domain = product?.domain?.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (domain) {
      try {
        const mapped = await mapSite(domain.startsWith("http") ? domain : `https://${domain}`, {
          limit: 6,
        });
        if (mapped.ok && mapped.links.length) {
          anyFc = true;
          for (const link of mapped.links.slice(0, 3)) {
            signals.push({
              source: "firecrawl",
              url: link,
              payload: {
                kind: "sitemap",
                engagement: 1,
                post_count: 1,
              },
            });
          }
          evidence.push(`Firecrawl map ${domain}: ${mapped.links.length} links`);
        }
      } catch {
        /* soft */
      }
    }
    if (anyFc) providers_used.push("firecrawl");
  } else {
    evidence.push("FIRECRAWL_API_KEY unset — skip scrape");
  }

  // --- E2B forensics when we have owner/repo ---
  if (github_repo && process.env.E2B_API_KEY?.trim()) {
    try {
      const health = await e2bHealth();
      if (health.ok) {
        const sbx = await e2bCodeForensics(github_repo);
        if (sbx.ok || sbx.stdout) {
          providers_used.push("e2b");
          signals.push({
            source: "e2b",
            url: `https://github.com/${github_repo}`,
            payload: {
              sandbox_id: sbx.sandboxId,
              stdout_excerpt: (sbx.stdout ?? "").slice(0, 2000),
              commits_public: 1,
              shipping_events: 1,
            },
          });
          evidence.push(
            `E2B sandbox ${sbx.sandboxId ?? "?"} on ${github_repo}`,
          );
        } else {
          errors.push(sbx.error ?? "E2B forensics failed");
        }
      } else {
        evidence.push(`E2B not ready: ${health.error ?? "skipped"}`);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "E2B failed");
    }
  }

  return {
    signals,
    providers_used: [...new Set(providers_used)],
    evidence: evidence.slice(0, 24),
    errors: errors.slice(0, 12),
    github_repo,
  };
}
