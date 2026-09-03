import {
  coherenceFromSignals,
  composeFounderScoreFromGravity,
  enrichFromProfile,
  inferTrackRecord,
  runAgentLanes,
  scoreGravityFromSignals,
} from "@vibe/engine";
import { NextResponse } from "next/server";
import { resolveFounder } from "@/lib/resolve-founder";
import { withOwnedStore } from "@/lib/with-store";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Profile + agent enrichment without full screen.
 * Writes gravity signals from GitHub / Tavily / Firecrawl / E2B, then rescores.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withOwnedStore(async () => {

    const { id } = await ctx.params;
    const store = getStore();
    let founder = await resolveFounder(store, id);
    if (!founder) {
      return NextResponse.json({ error: "founder not found" }, { status: 404 });
    }
    const founderId = founder.id;

    // Optional body: attach handles so thin inbound rows can get gravity without re-apply.
    let body: { github?: string; x_handle?: string; linkedin?: string } = {};
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        body = (await req.json()) as typeof body;
      }
    } catch {
      /* empty body OK */
    }
    const gh = (body.github ?? "").trim().replace(/^@/, "");
    const x = (body.x_handle ?? "").trim().replace(/^@/, "");
    const li = (body.linkedin ?? "").trim();
    if (gh || x || li) {
      const links = [...(founder.links ?? [])];
      if (gh && !links.some((l) => l.includes("github.com"))) {
        links.push(`https://github.com/${gh}`);
      }
      founder = await store.upsertFounder({
        id: founderId,
        name: founder.name,
        handles: {
          ...founder.handles,
          ...(gh ? { github: gh } : {}),
          ...(x ? { twitter: x, x } : {}),
          ...(li ? { linkedin: li } : {}),
        },
        links,
      });
    }

    const product = await store.getProductForFounder(founderId);

    const profile = await enrichFromProfile(founder, product);
    for (const sp of profile.signals) {
      await store.addSignal({
        entity_type: "founder",
        entity_id: founderId,
        source: sp.source,
        url: sp.url,
        payload: sp.payload,
        observed_at: new Date().toISOString(),
      });
    }

    const founderNow = (await store.getFounder(founderId)) ?? founder;
    const fleet = await runAgentLanes({
      founder: founderNow,
      product,
      claims: founderNow.claims,
    });

    for (const lane of fleet.lanes) {
      for (const sp of lane.signal_payloads ?? []) {
        await store.addSignal({
          entity_type: "founder",
          entity_id: founderId,
          source: sp.source,
          url: sp.url,
          payload: sp.payload,
          observed_at: new Date().toISOString(),
        });
      }
    }

    const signals = await store.getSignalsFor(founderId);
    const gravity = scoreGravityFromSignals(signals);
    const score = composeFounderScoreFromGravity(gravity, {
      coherence: coherenceFromSignals(new Set(signals.map((s) => s.source)).size),
      track_record: inferTrackRecord(founderNow),
    });
    await store.upsertFounder({
      id: founderId,
      name: founderNow.name,
      founder_score: score.founder_score,
      score_confidence: score.score_confidence,
      gravity,
      handles: founderNow.handles,
    });

    return NextResponse.json({
      ok: true,
      founder_id: founderId,
      profile: {
        providers: profile.providers_used,
        signals: profile.signals.length,
        evidence: profile.evidence,
        errors: profile.errors,
        github_repo: profile.github_repo,
      },
      gravity: gravity.gravity_score,
      founder_score: score.founder_score,
      ...fleet,
    });
  });
}
