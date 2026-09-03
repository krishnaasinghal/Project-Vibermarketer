import type { Founder, Product, Thesis } from "../types";
import { sectorMatchesThesis } from "./sector-match";

export type ThesisFit = "match" | "partial" | "miss";

export function thesisFit(
  thesis: Thesis | null | undefined,
  product?: Product | null,
  founder?: Founder | null,
): { fit: ThesisFit; note: string } {
  if (!thesis) return { fit: "match", note: "No thesis configured" };

  let sectorOk = true;
  let stageOk = true;
  let geoOk = true;
  const notes: string[] = [];

  if (thesis.sectors?.length) {
    if (!product?.sector) {
      sectorOk = false;
      notes.push("sector undisclosed");
    } else {
      sectorOk = sectorMatchesThesis(product.sector, thesis.sectors);
      notes.push(sectorOk ? `sector ok (${product.sector})` : `sector miss (${product.sector})`);
    }
  }

  if (thesis.stage && product?.stage) {
    const a = thesis.stage.toLowerCase();
    const b = product.stage.toLowerCase();
    stageOk = a.includes(b) || b.includes(a) || (a.includes("pre") && b.includes("pre"));
    notes.push(stageOk ? "stage ok" : `stage miss (${product.stage})`);
  }

  if (thesis.geo && thesis.geo.toLowerCase() !== "global") {
    const hay = `${founder?.bio ?? ""} ${product?.oneliner ?? ""}`.toLowerCase();
    geoOk = hay.includes(thesis.geo.toLowerCase());
    notes.push(geoOk ? "geo ok" : `geo soft-miss (${thesis.geo})`);
  }

  if (sectorOk && stageOk && geoOk) return { fit: "match", note: notes.join("; ") || "match" };
  if (sectorOk || stageOk) return { fit: "partial", note: notes.join("; ") };
  return { fit: "miss", note: notes.join("; ") };
}

export function scoreHistoryTrend(
  history: Array<{ score: number }> | undefined,
): "improving" | "declining" | "stable" {
  if (!history || history.length < 2) return "stable";
  const prev = history[history.length - 2]!.score;
  const last = history[history.length - 1]!.score;
  const delta = last - prev;
  if (delta >= 5) return "improving";
  if (delta <= -5) return "declining";
  return "stable";
}

export function momentumDelta(
  history: Array<{ score: number }> | undefined,
): number {
  if (!history || history.length < 2) return 0;
  return (
    history[history.length - 1]!.score - history[history.length - 2]!.score
  );
}
