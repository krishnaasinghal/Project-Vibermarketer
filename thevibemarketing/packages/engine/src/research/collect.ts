import { e2bCodeForensics, e2bHealth } from "../connectors/e2b";
import {
  firecrawlSearch,
  mapSite,
  scrapeMarkdown,
} from "../connectors/firecrawl";
import { parseGithubInput } from "../connectors/github";
import { tavilySearch } from "../connectors/tavily";
import type { Founder, Product, Signal } from "../types";
import type {
  ProviderStatus,
  ResearchHit,
  ResearchScrape,
} from "./types";

export type CollectResult = {
  hits: ResearchHit[];
  scrapes: ResearchScrape[];
  provider_status: Record<string, ProviderStatus>;
  e2b_sandbox_id?: string;
};

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function resolveRepo(
  founder: Founder,
  product?: Product | null,
): string | null {
  const handle = founder.handles.github?.trim();
  if (handle?.includes("/")) {
    const p = parseGithubInput(handle);
    if (p?.repo) return `${p.owner}/${p.repo}`;
  }
  for (const link of founder.links ?? []) {
    const p = parseGithubInput(link);
    if (p?.repo) return `${p.owner}/${p.repo}`;
  }
  if (product?.domain && /github\.com/i.test(product.domain)) {
    const p = parseGithubInput(product.domain);
    if (p?.repo) return `${p.owner}/${p.repo}`;
  }
  return null;
}

/**
 * Fan-out collectors with per-provider budgets.
 * Never throws — missing keys become skipped.
 */
export async function collectResearchEvidence(opts: {
  queries: string[];
  founder: Founder;
  product?: Product | null;
  signals: Signal[];
  maxScrapes?: number;
}): Promise<CollectResult> {
  const maxScrapes = opts.maxScrapes ?? 3;
  const hits: ResearchHit[] = [];
  const scrapes: ResearchScrape[] = [];
  const provider_status: Record<string, ProviderStatus> = {
    tavily: "skipped",
    firecrawl: "skipped",
    e2b: "skipped",
    signal: "skipped",
  };

  // Existing Memory signals first (always available)
  for (const s of opts.signals.slice(0, 12)) {
    const url = s.url ?? "";
    const excerpt = JSON.stringify(s.payload).slice(0, 280);
    hits.push({
      provider: "signal",
      query: "memory",
      url: url || `signal://${s.source}`,
      title: `${s.source} signal`,
      excerpt,
    });
  }
  if (opts.signals.length > 0) provider_status.signal = "ok";

  // Tavily — parallel queries
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) {
    try {
      const tavilyJobs = opts.queries.slice(0, 4).map(async (q, i) => {
        const r = await withTimeout(
          tavilySearch(q, {
            maxResults: 3,
            searchDepth: i === 0 ? "advanced" : "basic",
          }),
          12_000,
          `tavily:${i}`,
        );
        return { q, r };
      });
      const settled = await Promise.allSettled(tavilyJobs);
      let anyOk = false;
      for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        const { q, r } = s.value;
        if (!r.ok) continue;
        anyOk = true;
        for (const hit of r.results.slice(0, 3)) {
          hits.push({
            provider: "tavily",
            query: q,
            url: hit.url,
            title: hit.title,
            excerpt: (hit.content ?? "").slice(0, 400),
          });
        }
      }
      provider_status.tavily = anyOk ? "ok" : "failed";
    } catch {
      provider_status.tavily = "timeout";
    }
  }

  // Firecrawl search + optional map/scrape
  const fcKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (fcKey) {
    try {
      const primaryQ = opts.queries[0]!;
      const search = await withTimeout(
        firecrawlSearch(primaryQ, { limit: 3, scrapeMarkdown: false }),
        15_000,
        "firecrawl:search",
      );
      if (search.ok) {
        provider_status.firecrawl = "ok";
        for (const hit of search.hits) {
          hits.push({
            provider: "firecrawl",
            query: primaryQ,
            url: hit.url,
            title: hit.title,
            excerpt: (hit.description ?? hit.markdown ?? "").slice(0, 400),
          });
        }
      } else {
        provider_status.firecrawl = "failed";
      }

      const domain = opts.product?.domain?.trim();
      if (domain) {
        const mapped = await withTimeout(
          mapSite(domain, { limit: 5 }),
          12_000,
          "firecrawl:map",
        );
        if (mapped.ok) {
          for (const link of mapped.links.slice(0, 3)) {
            hits.push({
              provider: "firecrawl",
              query: `map:${domain}`,
              url: link,
              title: `Site map · ${domain}`,
              excerpt: "Mapped page candidate for diligence scrape",
            });
          }
        }
      }
    } catch {
      provider_status.firecrawl =
        provider_status.firecrawl === "ok" ? "ok" : "timeout";
    }
  }

  // Prefer founder-supplied site/social URLs first, then search hits
  const profileUrls: string[] = [];
  for (const l of opts.founder.links ?? []) {
    if (/^https?:\/\//i.test(l)) profileUrls.push(l);
  }
  if (opts.product?.domain) {
    const d = opts.product.domain.trim();
    profileUrls.push(d.startsWith("http") ? d : `https://${d}`);
  }
  const gh = opts.founder.handles.github?.replace(/^@/, "");
  if (gh) profileUrls.push(`https://github.com/${gh}`);
  const tw = (opts.founder.handles.twitter ?? opts.founder.handles.x)?.replace(
    /^@/,
    "",
  );
  if (tw) profileUrls.push(`https://x.com/${tw}`);

  const scrapeTargets = [
    ...new Set(
      [
        ...profileUrls,
        ...hits
          .map((h) => h.url)
          .filter((u) => /^https?:\/\//i.test(u) && !u.includes("signal://")),
      ],
    ),
  ].slice(0, Math.max(maxScrapes, 4));

  if (fcKey && scrapeTargets.length > 0) {
    const scrapeJobs = scrapeTargets.map(async (url) => {
      try {
        const md = await withTimeout(
          scrapeMarkdown(url),
          14_000,
          `scrape:${url.slice(0, 40)}`,
        );
        if (md && md.length > 40) {
          scrapes.push({ url, chars: md.length, ok: true });
          hits.push({
            provider: "firecrawl",
            query: "scrape",
            url,
            title: `Scrape · ${url}`,
            excerpt: md.slice(0, 600),
          });
        } else {
          scrapes.push({
            url,
            chars: 0,
            ok: false,
            error: "empty markdown",
          });
        }
      } catch (e) {
        scrapes.push({
          url,
          chars: 0,
          ok: false,
          error: e instanceof Error ? e.message : "scrape failed",
        });
      }
    });
    await Promise.allSettled(scrapeJobs);
    if (scrapes.some((s) => s.ok)) provider_status.firecrawl = "ok";
  }

  // Optional E2B code forensics
  const repo = resolveRepo(opts.founder, opts.product);
  if (repo && process.env.E2B_API_KEY?.trim()) {
    try {
      const health = await withTimeout(e2bHealth(), 8_000, "e2b:health");
      if (!health.ok) {
        provider_status.e2b = "skipped";
      } else {
        const result = await withTimeout(
          e2bCodeForensics(repo),
          35_000,
          "e2b:forensics",
        );
        if (result.ok) {
          provider_status.e2b = "ok";
          hits.push({
            provider: "e2b",
            query: `forensics:${repo}`,
            url: `https://github.com/${repo}`,
            title: `E2B forensics · ${repo}`,
            excerpt: (result.stdout ?? "").slice(0, 500),
          });
          return {
            hits,
            scrapes,
            provider_status,
            e2b_sandbox_id: result.sandboxId,
          };
        }
        provider_status.e2b = "failed";
      }
    } catch {
      provider_status.e2b = "timeout";
    }
  }

  return { hits, scrapes, provider_status };
}
