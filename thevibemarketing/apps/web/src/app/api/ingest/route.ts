import {
  coherenceFromSignals,
  composeFounderScoreFromGravity,
  evaluateConviction,
  ingestAsFounderDrafts,
  runVcBrainPipeline,
  scoreGravityFromSignals,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { withOwnedStore } from "@/lib/with-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Max auto-screens per Identify refresh — keeps demo latency sane. */
const AUTO_SCREEN_CAP = 2;

/**
 * POST /api/ingest — live GitHub + HN + arXiv only.
 * Product Hunt / accelerators / hackathons → not configured (zero rows).
 * Discovered authors are candidates — not auto-verified founders.
 *
 * Conviction path: when gravity / Founder Score crosses threshold and thesis
 * is not a hard miss, auto-run the 3-axis pipeline (brief: fund that runs itself).
 */
export async function POST(req: Request) {
  return withOwnedStore(async () => {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    // Opt-in only: auto-screen runs full diligence (LLM + scrapers) and can take minutes.
    // Identify should return candidates fast; use Screen all / founder page for scoring.
    const autoScreen = url.searchParams.get("auto_screen") === "1";
    const limit = Math.min(
      40,
      Math.max(1, Number(url.searchParams.get("limit") || 20) || 20),
    );

    try {
      const { items, drafts, sources } = await ingestAsFounderDrafts();
      const selected = drafts.slice(0, limit);
      const liveOk =
        sources.github.ok || sources.hackernews.ok || sources.arxiv.ok;

      if (dry) {
        return NextResponse.json({
          ok: true,
          dry: true,
          sources,
          live_ok: liveOk,
          item_count: items.length,
          draft_count: drafts.length,
          selected: selected.map((d) => ({
            id: d.founder.id,
            name: d.founder.name,
            signals: d.signals.length,
            product: d.product.name,
            identity: "candidate",
          })),
        });
      }

      if (!liveOk && selected.length === 0) {
        return NextResponse.json({
          ok: false,
          sources,
          live_ok: false,
          item_count: 0,
          upserted_count: 0,
          upserted: [],
          note: "No live sources returned data. No fabricated fallbacks.",
        });
      }

      const store = getStore();
      const thesis = await store.getThesis();
      const upserted: Array<{
        id: string;
        name: string;
        founder_score: number;
        gravity: number;
        identity: "candidate";
        conviction_crossed?: boolean;
        auto_screened?: boolean;
        decision?: string;
      }> = [];

      for (const draft of selected) {
        const founder = await store.upsertFounder({
          ...draft.founder,
          founder_score: draft.founder.founder_score ?? 0,
          score_confidence: draft.founder.score_confidence ?? 0,
        });
        const product = await store.upsertProduct({
          ...draft.product,
          founder_id: founder.id,
          id:
            draft.product.founder_id === founder.id
              ? draft.product.id
              : `p_${founder.id}`,
        });
        for (const s of draft.signals) {
          await store.addSignal({
            entity_type: s.entity_type,
            entity_id: founder.id,
            source: s.source,
            url: s.url,
            payload: {
              ...s.payload,
              identity_state: "candidate",
              discovered_via: "identify",
            },
            observed_at: s.observed_at,
          });
        }
        const signals = await store.getSignalsFor(founder.id);
        const gravity = scoreGravityFromSignals(signals);
        const score = composeFounderScoreFromGravity(gravity, {
          coherence: coherenceFromSignals(
            new Set(signals.map((x) => x.source)).size,
          ),
          track_record: null,
        });
        const updated = await store.upsertFounder({
          id: founder.id,
          name: founder.name,
          founder_score: score.founder_score,
          score_confidence: score.score_confidence,
          gravity,
        });

        const prior = await store.getLatestScreening(updated.id);
        const conviction = evaluateConviction({
          founder: updated,
          product,
          thesis,
          alreadyScreened: Boolean(prior),
        });

        upserted.push({
          id: updated.id,
          name: updated.name,
          founder_score: updated.founder_score,
          gravity: gravity.gravity_score,
          identity: "candidate",
          conviction_crossed: conviction.crossed,
        });
      }

      const dedupe = await store.dedupeFounders();
      upserted.sort((a, b) => b.founder_score - a.founder_score);

      const autoScreened: Array<{
        id: string;
        decision: string;
        reasons: string[];
      }> = [];

      if (autoScreen) {
        const candidates = upserted
          .filter((u) => u.conviction_crossed)
          .slice(0, AUTO_SCREEN_CAP);

        for (const c of candidates) {
          try {
            const result = await runVcBrainPipeline(store, c.id);
            const row = upserted.find((u) => u.id === c.id);
            if (row) {
              row.auto_screened = true;
              row.decision = result.memo.decision;
            }
            const conv = evaluateConviction({
              founder: result.founder,
              product: result.product,
              thesis,
              alreadyScreened: false,
            });
            autoScreened.push({
              id: c.id,
              decision: result.memo.decision,
              reasons: conv.reasons,
            });
          } catch (e) {
            console.error("[ingest] auto-screen", c.id, e);
          }
        }
      }

      return NextResponse.json({
        ok: upserted.length > 0,
        sources,
        live_ok: liveOk,
        item_count: items.length,
        upserted_count: upserted.length,
        dedupe,
        auto_screened: autoScreened,
        auto_screened_count: autoScreened.length,
        note:
          autoScreened.length > 0
            ? `Identify + conviction auto-screened ${autoScreened.length} founder(s) (cap ${AUTO_SCREEN_CAP}).`
            : "Identify upserted live candidates only. Run Screen all (or open a founder) to score — not auto-run on Identify.",
        upserted,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ingest failed" },
        { status: 500 },
      );
    }
  });
}

export async function GET() {
  return NextResponse.json({
    tip: "POST /api/ingest — live GitHub+HN+arXiv. Optional ?auto_screen=1 runs conviction diligence (slow).",
  });
}
