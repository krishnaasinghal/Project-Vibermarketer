import type { Founder } from "../types";

/**
 * Infer optional track-record score (0–100) from bio/claims.
 * Returns null when absent so Founder Score redistributes weight (anti cold-start bias).
 */
export function inferTrackRecord(founder: Founder): number | null {
  const text =
    `${founder.bio ?? ""} ${founder.claims.map((c) => c.text).join(" ")}`.toLowerCase();
  if (
    !/ex-(google|meta|amazon|apple|stripe|openai)|y combinator|\byc\b|raised|series [abc]|faang/.test(
      text,
    )
  ) {
    return null;
  }
  let score = 55;
  if (/y combinator|\byc\b/.test(text)) score += 20;
  if (/ex-(google|meta|openai|stripe)/.test(text)) score += 15;
  return Math.min(100, score);
}

/** Multi-source coherence heuristic used by seed/ingest/screen. */
export function coherenceFromSignals(sourceCount: number): number {
  return sourceCount >= 2 ? 70 : 45;
}
