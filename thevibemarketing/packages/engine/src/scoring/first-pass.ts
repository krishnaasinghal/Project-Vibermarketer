import type { Founder, Product, Thesis } from "../types";
import { sectorMatchesThesis } from "./sector-match";

export type FirstPassResult = {
  pass: boolean;
  reasons: string[];
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

/**
 * Cheap gate before full 3-axis + memo analysis.
 * Hard-fails only when analysis cannot run (no company, no materials on inbound,
 * no wedge, thin signal). Sector / thesis mismatch is a soft signal — the memo
 * encodes it as NO/WATCH + gaps, never blocks Generate memo.
 */
export function firstPassScreen(input: {
  founder: Founder;
  product?: Product | null;
  thesis?: Thesis | null;
  requireDeck?: boolean;
}): FirstPassResult {
  const { founder, product, thesis, requireDeck = false } = input;
  const checks: FirstPassResult["checks"] = [];
  const reasons: string[] = [];

  const hasCompany = Boolean(product?.name?.trim());
  checks.push({
    name: "company_name",
    ok: hasCompany,
    detail: hasCompany ? product!.name : "Company name missing",
  });
  if (!hasCompany) reasons.push("Company name required");

  const links = founder.links ?? [];
  const claims = founder.claims ?? [];
  // Materials = deck host OR any public https product/site link OR PDF claim.
  const hasHttpMaterials = links.some((l) => /^https?:\/\//i.test(l));
  const hasDeck =
    Boolean(product?.domain) ||
    hasHttpMaterials ||
    links.some((l) => /deck|pitch|doc|notion|drive|dropbox|pdf/i.test(l)) ||
    claims.some((c) => /deck|materials|website|site/i.test(c.text));
  checks.push({
    name: "deck_or_materials",
    ok: hasDeck || !requireDeck,
    detail: hasDeck
      ? hasHttpMaterials || product?.domain
        ? "Deck / product site / materials present"
        : "Deck / materials present"
      : requireDeck
        ? "Deck URL or product site required for inbound"
        : "Deck optional for outbound signal",
  });
  if (requireDeck && !hasDeck) {
    reasons.push("Deck URL or product site required for 24h decision");
  }
  const hasWedge = Boolean(product?.oneliner?.trim() || founder.bio?.trim());
  checks.push({
    name: "wedge",
    ok: hasWedge,
    detail: hasWedge ? "One-liner / bio present" : "No product one-liner or bio",
  });
  if (!hasWedge) reasons.push("Need a one-liner or bio for screening");

  if (thesis?.sectors?.length && product?.sector) {
    const hit = sectorMatchesThesis(product.sector, thesis.sectors);
    checks.push({
      name: "thesis_sector",
      ok: hit,
      detail: hit
        ? `Sector "${product.sector}" fits thesis`
        : `Sector "${product.sector}" outside thesis [${thesis.sectors.join(", ")}] — soft flag; full analysis still runs`,
    });
    // Soft only: mismatch must not block memo / 3-axis. Decision layer owns NO/WATCH.
  } else {
    checks.push({
      name: "thesis_sector",
      ok: true,
      detail: "No hard sector filter applied",
    });
  }

  const thin =
    Boolean(founder.gravity?.abstain) &&
    claims.length === 0 &&
    (product?.traction_claims?.length ?? 0) === 0 &&
    founder.founder_score < 15;
  checks.push({
    name: "minimum_signal",
    ok: !thin,
    detail: thin
      ? "Zero claims + gravity abstain + near-zero Founder Score"
      : "Enough signal to proceed",
  });
  if (thin) reasons.push("Insufficient signal — cannot screen in 24h");

  return { pass: reasons.length === 0, reasons, checks };
}
