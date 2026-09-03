import type { Thesis } from "./types";

/**
 * Canonical ownership is a fraction in (0, 1], e.g. 0.10 = 10%.
 * Accepts percent numbers (10 → 0.10), fractions (0.10), and strings ("10%", "8-12%").
 */
export function normalizeOwnershipTarget(raw: unknown, fallback = 0.1): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw <= 0) return fallback;
    if (raw > 1) return Math.min(1, raw / 100);
    return raw;
  }
  if (typeof raw === "string") {
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) return fallback;
      // "8-12%" → use first number as percent
      return Math.min(1, n > 1 ? n / 100 : n);
    }
  }
  return fallback;
}

/** Display helper — always returns percent points (e.g. 10 for 10%). */
export function ownershipToPercent(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return target > 1 ? target : target * 100;
}

export function normalizeThesis(raw: Record<string, unknown> | Partial<Thesis>): Thesis {
  return {
    sectors: Array.isArray(raw.sectors)
      ? (raw.sectors as string[])
      : ["AI infra", "developer tools"],
    stage: typeof raw.stage === "string" ? raw.stage : "pre-seed",
    geo: typeof raw.geo === "string" ? raw.geo : "global",
    check_size: typeof raw.check_size === "number" ? raw.check_size : 100_000,
    ownership_target: normalizeOwnershipTarget(raw.ownership_target, 0.1),
    risk: typeof raw.risk === "string" ? raw.risk : "moderate",
  };
}

export function defaultThesis(): Thesis {
  return {
    // MGV-flavored default — early enterprise / technical SaaS, $100K scout check.
    sectors: [
      "AI infra",
      "developer tools",
      "enterprise SaaS",
      "agentic software",
    ],
    stage: "pre-seed",
    geo: "global",
    check_size: 100_000,
    ownership_target: 0.1,
    risk: "moderate",
  };
}
