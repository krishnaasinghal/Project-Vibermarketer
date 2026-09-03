/**
 * E2B sandbox connector — Team API key (e2b_…) required.
 * Uses official SDK for create / commands.run / kill.
 * Offline / bad key: health returns ok:false without throwing.
 */

import { Sandbox } from "e2b";

const E2B_BASE = "https://api.e2b.app";

export type E2BHealth = {
  configured: boolean;
  ok: boolean;
  error?: string;
  hint?: string;
};

export type E2BCommandResult = {
  ok: boolean;
  sandboxId?: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
  latency_ms: number;
};

function apiKey(): string | null {
  return process.env.E2B_API_KEY?.trim() || null;
}

export function isE2BConfigured(): boolean {
  return Boolean(apiKey());
}

function looksLikeUuid(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    key,
  );
}

export async function e2bHealth(): Promise<E2BHealth> {
  const key = apiKey();
  if (!key) {
    return { configured: false, ok: false, error: "E2B_API_KEY unset" };
  }
  if (looksLikeUuid(key)) {
    return {
      configured: true,
      ok: false,
      error: "E2B_API_KEY looks like a UUID, not a team API key",
      hint: "Copy Team API key from e2b.dev dashboard (usually starts with e2b_)",
    };
  }

  try {
    const res = await fetch(`${E2B_BASE}/v2/sandboxes?limit=1`, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        configured: true,
        ok: false,
        error: `E2B HTTP ${res.status}: ${text.slice(0, 160)}`,
        hint: "Use Team API key from e2b.dev → API Keys",
      };
    }
    return { configured: true, ok: true };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : "E2B health failed",
    };
  }
}

/**
 * Create a short-lived sandbox (SDK). Prefer withSandbox / runSandboxCommand.
 */
export async function createSandbox(opts?: {
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  sandboxId?: string;
  error?: string;
}> {
  const health = await e2bHealth();
  if (!health.ok) {
    return { ok: false, error: health.error || health.hint || "E2B not ready" };
  }
  try {
    const sandbox = await Sandbox.create({
      apiKey: apiKey()!,
      timeoutMs: Math.min(opts?.timeoutMs ?? 60_000, 120_000),
    });
    return { ok: true, sandboxId: sandbox.sandboxId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "E2B createSandbox failed",
    };
  }
}

/**
 * Run a shell command in a fresh sandbox, then kill it.
 * Role isolation: only pass env vars the lane needs (never OpenAI).
 */
export async function runSandboxCommand(
  command: string,
  opts?: {
    timeoutMs?: number;
    envs?: Record<string, string>;
    cwd?: string;
  },
): Promise<E2BCommandResult> {
  const t0 = Date.now();
  const health = await e2bHealth();
  if (!health.ok) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: health.error || health.hint || "E2B not ready",
      latency_ms: Date.now() - t0,
    };
  }

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({
      apiKey: apiKey()!,
      timeoutMs: Math.min(opts?.timeoutMs ?? 90_000, 120_000),
      envs: opts?.envs,
    });
    const result = await sandbox.commands.run(command, {
      timeoutMs: Math.min(opts?.timeoutMs ?? 75_000, 110_000),
      cwd: opts?.cwd,
    });
    return {
      ok: result.exitCode === 0,
      sandboxId: sandbox.sandboxId,
      stdout: (result.stdout ?? "").slice(0, 8_000),
      stderr: (result.stderr ?? "").slice(0, 2_000),
      exitCode: result.exitCode,
      error: result.exitCode === 0 ? undefined : `exit ${result.exitCode}`,
      latency_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      sandboxId: sandbox?.sandboxId,
      stdout: "",
      stderr: "",
      error: e instanceof Error ? e.message : "E2B command failed",
      latency_ms: Date.now() - t0,
    };
  } finally {
    try {
      await sandbox?.kill();
    } catch {
      /* ignore kill errors */
    }
  }
}

/**
 * Code Forensics lane — shallow clone + recent git log inside E2B.
 * Does not inject OpenAI. Optional GITHUB_TOKEN for private/rate limits.
 */
export async function e2bCodeForensics(repoFullName: string): Promise<
  E2BCommandResult & {
    role: "code_forensics";
    repo: string;
  }
> {
  const repo = repoFullName.trim().replace(/^https?:\/\/github\.com\//i, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return {
      role: "code_forensics",
      repo,
      ok: false,
      stdout: "",
      stderr: "",
      error: "Invalid owner/repo",
      latency_ms: 0,
    };
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  const cloneUrl = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;

  // Single shell script — keep secrets out of stdout. Structured markers for scoring.
  const cmd = [
    "set -e",
    "rm -rf /tmp/forensics && mkdir -p /tmp/forensics",
    `git clone --depth 40 --quiet ${JSON.stringify(cloneUrl)} /tmp/forensics/repo`,
    "cd /tmp/forensics/repo",
    'echo "=== COMMITS ==="',
    "git log --oneline -20",
    'echo "=== LAST_COMMIT_ISO ==="',
    'git log -1 --format=%cI',
    'echo "=== COMMIT_COUNT ==="',
    "git rev-list --count HEAD",
    'echo "=== FILES ==="',
    "ls -la | head -40",
    'echo "=== HAS_TESTS ==="',
    'if [ -d test ] || [ -d tests ] || [ -f vitest.config.ts ] || [ -f jest.config.js ] || [ -f pytest.ini ]; then echo yes; else echo no; fi',
    'echo "=== PACKAGE_MANIFEST ==="',
    'if [ -f package.json ]; then echo package.json; elif [ -f pyproject.toml ]; then echo pyproject.toml; elif [ -f Cargo.toml ]; then echo Cargo.toml; else echo none; fi',
  ].join(" && ");

  const result = await runSandboxCommand(cmd, {
    timeoutMs: 90_000,
    // Do not pass OPENAI / Firecrawl into this sandbox.
    envs: { GIT_TERMINAL_PROMPT: "0" },
  });

  return { ...result, role: "code_forensics", repo };
}

/** Parse structured markers from e2bCodeForensics stdout into scoreable fields. */
export function parseE2BForensicsStdout(stdout: string): {
  commit_count: number;
  last_commit_iso?: string;
  has_tests: boolean;
  manifest?: string;
  commits_public: number;
  shipping_events: number;
} {
  const section = (name: string): string => {
    const re = new RegExp(
      `=== ${name} ===\\n([\\s\\S]*?)(?=== [A-Z_]+ ===|$)`,
    );
    const m = stdout.match(re);
    return (m?.[1] ?? "").trim();
  };

  const commitCount = Number.parseInt(section("COMMIT_COUNT"), 10);
  const lastIso = section("LAST_COMMIT_ISO").split("\n")[0]?.trim();
  const hasTests = /^yes$/im.test(section("HAS_TESTS"));
  const manifest = section("PACKAGE_MANIFEST").split("\n")[0]?.trim();
  const logLines = section("COMMITS")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const n = Number.isFinite(commitCount)
    ? commitCount
    : Math.max(logLines.length, 0);

  return {
    commit_count: n,
    last_commit_iso:
      lastIso && /^\d{4}-\d{2}-\d{2}/.test(lastIso) ? lastIso : undefined,
    has_tests: hasTests,
    manifest: manifest && manifest !== "none" ? manifest : undefined,
    // Feed gravity extractGravityInputs aliases
    commits_public: n,
    shipping_events: Math.max(1, Math.min(n, 40)),
  };
}
