import type { NormalizedIngestItem } from "./types";

export type SourceFetchResult = {
  items: NormalizedIngestItem[];
  ok: boolean;
  error?: string;
  status?: number;
  /** Present when fetching a user profile (followers, login). */
  user?: { login: string; followers: number; html_url?: string };
};

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "thevibemarketing-vcbrain",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/** Parse `user`, `user/repo`, or github.com URLs into owner (+ optional repo). */
export function parseGithubInput(raw: string): {
  owner: string;
  repo?: string;
} | null {
  const s = raw.trim();
  if (!s) return null;

  const urlMatch = s.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?/i,
  );
  if (urlMatch?.[1]) {
    const owner = urlMatch[1];
    const repo = urlMatch[2] && urlMatch[2] !== "" ? urlMatch[2] : undefined;
    if (/^(orgs|settings|topics|marketplace|explore|pulls|issues)$/i.test(owner)) {
      return null;
    }
    return { owner, repo };
  }

  const slash = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (slash) return { owner: slash[1]!, repo: slash[2]! };

  if (/^[A-Za-z0-9_.-]{1,39}$/.test(s) && !s.includes(" ")) {
    return { owner: s };
  }

  return null;
}

/**
 * Public user (+ optional single repo) for Distribution Gravity Audit.
 * Uses unauthenticated GitHub API when GITHUB_TOKEN is unset (rate-limited).
 */
export async function fetchUserPublicRepos(
  owner: string,
  opts?: { repo?: string; limit?: number },
): Promise<SourceFetchResult> {
  const limit = opts?.limit ?? 10;
  const headers = githubHeaders();

  try {
    const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}`, {
      headers,
    });
    if (!userRes.ok) {
      return {
        items: [],
        ok: false,
        status: userRes.status,
        error: `GitHub user HTTP ${userRes.status}`,
      };
    }
    const user = (await userRes.json()) as {
      login: string;
      followers: number;
      html_url?: string;
    };

    let items: NormalizedIngestItem[] = [];

    if (opts?.repo) {
      const repoRes = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(opts.repo)}`,
        { headers },
      );
      if (!repoRes.ok) {
        return {
          items: [],
          ok: false,
          status: repoRes.status,
          error: `GitHub repo HTTP ${repoRes.status}`,
          user: {
            login: user.login,
            followers: user.followers,
            html_url: user.html_url,
          },
        };
      }
      const r = (await repoRes.json()) as {
        id: number;
        full_name: string;
        html_url: string;
        stargazers_count: number;
        forks_count: number;
        description: string | null;
        owner: { login: string };
        updated_at: string;
        pushed_at?: string;
      };
      items = [
        {
          source: "github",
          external_id: String(r.id),
          title: r.full_name,
          author: r.owner.login,
          url: r.html_url,
          observed_at: r.pushed_at || r.updated_at,
          metrics: { stars: r.stargazers_count, forks: r.forks_count },
          raw: r,
        },
      ];
    } else {
      const reposRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(owner)}/repos?sort=updated&per_page=${limit}&type=owner`,
        { headers },
      );
      if (!reposRes.ok) {
        return {
          items: [],
          ok: false,
          status: reposRes.status,
          error: `GitHub repos HTTP ${reposRes.status}`,
          user: {
            login: user.login,
            followers: user.followers,
            html_url: user.html_url,
          },
        };
      }
      const repos = (await reposRes.json()) as Array<{
        id: number;
        full_name: string;
        html_url: string;
        stargazers_count: number;
        forks_count: number;
        description: string | null;
        owner: { login: string };
        updated_at: string;
        pushed_at?: string;
        fork?: boolean;
      }>;
      items = (repos ?? [])
        .filter((r) => !r.fork)
        .slice(0, limit)
        .map((r) => ({
          source: "github" as const,
          external_id: String(r.id),
          title: r.full_name,
          author: r.owner.login,
          url: r.html_url,
          observed_at: r.pushed_at || r.updated_at,
          metrics: {
            stars: r.stargazers_count,
            forks: r.forks_count,
          },
          raw: r,
        }));
    }

    return {
      items,
      ok: true,
      user: {
        login: user.login,
        followers: user.followers,
        html_url: user.html_url,
      },
    };
  } catch (e) {
    return {
      items: [],
      ok: false,
      error: e instanceof Error ? e.message : "GitHub fetch failed",
    };
  }
}

function pushedAfterIso(): string {
  // Rolling ~18 month window so demos don't freeze on 2024-era repos.
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().slice(0, 10);
}

export type GithubSearchHit = {
  kind: "repo" | "user";
  owner: string;
  repo?: string;
  full_name?: string;
  html_url: string;
  stars?: number;
  forks?: number;
  followers?: number;
  description?: string | null;
};

export type GithubSearchResult = {
  ok: boolean;
  hits: GithubSearchHit[];
  error?: string;
  status?: number;
};

/**
 * Public GitHub search when a bare string isn't an exact username.
 * Prefers repo name matches (e.g. "kaggleingest" → Anand-0037/KaggleIngest).
 */
export async function searchGithubPublic(
  query: string,
  limit = 5,
): Promise<GithubSearchResult> {
  const q = query.trim();
  if (!q) {
    return { ok: false, hits: [], error: "Empty search query" };
  }

  const headers = githubHeaders();
  const hits: GithubSearchHit[] = [];

  const qLower = q.toLowerCase();
  const nameScore = (h: GithubSearchHit): number => {
    const repo = (h.repo ?? "").toLowerCase();
    const full = (h.full_name ?? "").toLowerCase();
    const owner = h.owner.toLowerCase();
    if (repo === qLower || full === qLower) return 10_000;
    if (owner === qLower && h.kind === "user") return 9_000;
    if (repo.includes(qLower) || full.endsWith(`/${qLower}`)) return 5_000 + (h.stars ?? 0);
    return h.stars ?? 0;
  };

  try {
    // Prefer name matches so "kaggleingest" resolves to …/KaggleIngest, not a starrier sibling repo.
    const repoQueries = [`${q} in:name`, q];
    for (const rq of repoQueries) {
      const repoRes = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(rq)}&per_page=${limit}`,
        { headers },
      );
      if (repoRes.status === 401 || repoRes.status === 403) {
        return {
          ok: false,
          hits: [],
          status: repoRes.status,
          error: `GitHub search HTTP ${repoRes.status} — check GITHUB_TOKEN scopes (fine-grained: Metadata + Contents read on public repos).`,
        };
      }
      if (!repoRes.ok) continue;
      const data = (await repoRes.json()) as {
        items?: Array<{
          full_name: string;
          html_url: string;
          stargazers_count: number;
          forks_count: number;
          description: string | null;
          owner: { login: string };
          name: string;
        }>;
      };
      for (const r of data.items ?? []) {
        if (hits.some((h) => h.full_name === r.full_name)) continue;
        hits.push({
          kind: "repo",
          owner: r.owner.login,
          repo: r.name,
          full_name: r.full_name,
          html_url: r.html_url,
          stars: r.stargazers_count,
          forks: r.forks_count,
          description: r.description,
        });
      }
      if (hits.some((h) => (h.repo ?? "").toLowerCase() === qLower)) break;
    }

    const userRes = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=${Math.min(3, limit)}`,
      { headers },
    );
    if (userRes.ok) {
      const data = (await userRes.json()) as {
        items?: Array<{ login: string; html_url: string }>;
      };
      for (const u of data.items ?? []) {
        if (hits.some((h) => h.owner.toLowerCase() === u.login.toLowerCase() && !h.repo)) {
          continue;
        }
        hits.push({
          kind: "user",
          owner: u.login,
          html_url: u.html_url,
        });
      }
    }

    hits.sort((a, b) => nameScore(b) - nameScore(a));
    return { ok: hits.length > 0, hits: hits.slice(0, limit), status: 200 };
  } catch (e) {
    return {
      ok: false,
      hits: [],
      error: e instanceof Error ? e.message : "GitHub search failed",
    };
  }
}

/** GET /repos/{owner}/{repo}/commits — recent shipping cadence. */
export async function fetchRepoCommits(
  owner: string,
  repo: string,
  limit = 20,
): Promise<{
  ok: boolean;
  commits: Array<{ sha: string; message: string; date: string; url: string }>;
  error?: string;
}> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${limit}`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) {
      return { ok: false, commits: [], error: `GitHub commits HTTP ${res.status}` };
    }
    const data = (await res.json()) as Array<{
      sha: string;
      html_url?: string;
      commit?: { message?: string; author?: { date?: string } };
    }>;
    return {
      ok: true,
      commits: (data ?? []).map((c) => ({
        sha: c.sha.slice(0, 7),
        message: (c.commit?.message ?? "").split("\n")[0]!.slice(0, 120),
        date: c.commit?.author?.date ?? "",
        url: c.html_url ?? "",
      })),
    };
  } catch (e) {
    return {
      ok: false,
      commits: [],
      error: e instanceof Error ? e.message : "commits failed",
    };
  }
}

/** GET /repos/{owner}/{repo}/readme — raw markdown (Base64 decode). */
export async function fetchRepoReadme(
  owner: string,
  repo: string,
): Promise<{ ok: boolean; markdown: string; html_url?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      {
        headers: { ...githubHeaders(), Accept: "application/vnd.github.raw" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      return { ok: false, markdown: "", error: `GitHub readme HTTP ${res.status}` };
    }
    const markdown = await res.text();
    return {
      ok: true,
      markdown: markdown.slice(0, 12_000),
      html_url: `https://github.com/${owner}/${repo}#readme`,
    };
  } catch (e) {
    return {
      ok: false,
      markdown: "",
      error: e instanceof Error ? e.message : "readme failed",
    };
  }
}

/** GET /repos/{owner}/{repo}/languages — tech stack signal. */
export async function fetchRepoLanguages(
  owner: string,
  repo: string,
): Promise<{ ok: boolean; languages: Record<string, number>; error?: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) {
      return { ok: false, languages: {}, error: `GitHub languages HTTP ${res.status}` };
    }
    const languages = (await res.json()) as Record<string, number>;
    return { ok: true, languages };
  } catch (e) {
    return {
      ok: false,
      languages: {},
      error: e instanceof Error ? e.message : "languages failed",
    };
  }
}

export async function fetchTrendingAiRepos(
  limit = 15,
): Promise<NormalizedIngestItem[]> {
  const r = await fetchTrendingAiReposDetailed(limit);
  return r.items;
}

export async function fetchTrendingAiReposDetailed(
  limit = 15,
): Promise<SourceFetchResult> {
  try {
    const headers = githubHeaders();
    const q = encodeURIComponent(
      `topic:ai pushed:>${pushedAfterIso()}`,
    );
    const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return {
        items: [],
        ok: false,
        status: res.status,
        error: `GitHub HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      items?: Array<{
        id: number;
        full_name: string;
        html_url: string;
        stargazers_count: number;
        forks_count: number;
        description: string | null;
        homepage?: string | null;
        owner: { login: string };
        updated_at: string;
        pushed_at?: string;
      }>;
    };
    const items = (data.items ?? []).map((r) => ({
      source: "github" as const,
      external_id: String(r.id),
      title: r.full_name,
      author: r.owner.login,
      url: r.html_url,
      observed_at: r.pushed_at || r.updated_at,
      metrics: {
        stars: r.stargazers_count,
        forks: r.forks_count,
      },
      raw: r,
    }));
    return { items, ok: true, status: res.status };
  } catch (e) {
    return {
      items: [],
      ok: false,
      error: e instanceof Error ? e.message : "GitHub fetch failed",
    };
  }
}
