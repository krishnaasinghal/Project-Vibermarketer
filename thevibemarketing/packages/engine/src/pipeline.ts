import {
  runAgentLanes,
  type AgentFleetResult,
} from "./agents/lanes";
import { buildMemo } from "./memo/build";
import type { MemoryStore } from "./memory/store";
import { executeAutomatedDiligence } from "./pipeline/diligence";
import { runDeepResearch } from "./research/deep-research";
import { enrichFromProfile } from "./research/profile-enrich";
import type { ResearchDossier } from "./research/types";
import { screenAxes } from "./scoring/axes";
import { firstPassScreen, type FirstPassResult } from "./scoring/first-pass";
import { composeFounderScoreFromGravity } from "./scoring/founder-score";
import { scoreGravityFromSignals } from "./scoring/gravity";
import { coherenceFromSignals, inferTrackRecord } from "./scoring/track-record";
import { dedupeClaims, evaluateClaims } from "./scoring/trust";
import { validateClaims } from "./scoring/validator";
import { defaultThesis } from "./thesis";
import { startRun, step } from "./trace";
import type { Claim, Founder, Memo, Product, Screening, Thesis } from "./types";

export type PipelineResult = {
  run_id: string;
  founder: Founder;
  product?: Product;
  screening: Screening;
  memo: Memo;
  claims: Claim[];
  first_pass: FirstPassResult;
  validator: { flags: string[]; corrected: boolean };
  agents?: AgentFleetResult;
  research?: ResearchDossier;
};

/**
 * Full VC Brain happy path: gravity → founder score → trust → 3-axis → memo.
 * Single pipeline used by APIs and smoke paths — do not duplicate in the web app.
 */
export async function runVcBrainPipeline(
  store: MemoryStore,
  founderId: string,
  thesis?: Thesis | null,
): Promise<PipelineResult> {
  const founder = await store.getFounder(founderId);
  if (!founder) throw new Error(`Founder not found: ${founderId}`);

  const product = await store.getProductForFounder(founderId);
  const signals = await store.getSignalsFor(founderId);
  const activeThesis =
    thesis ?? (await store.getThesis()) ?? defaultThesis();
  const history = await store.listScreenings(founderId);

  const { run_id } = startRun("vc");

  const first_pass = firstPassScreen({
    founder,
    product,
    thesis: activeThesis,
    requireDeck: founderId.startsWith("inbound_"),
  });
  await step(
    run_id,
    "first_pass",
    { founder_id: founderId },
    first_pass,
    first_pass.pass
      ? ["First-pass gate cleared"]
      : first_pass.reasons,
    store,
  );
  if (!first_pass.pass) {
    throw new Error(
      `First-pass failed: ${first_pass.reasons.join("; ")}. Fix materials before full analysis.`,
    );
  }

  await step(
    run_id,
    "load_signals",
    { founder_id: founderId },
    { signals: signals.length, sources: [...new Set(signals.map((s) => s.source))] },
    signals.map((s) => s.url ?? s.source),
    store,
  );

  // Profile-seeded public pull (GH followers/stars · Tavily · Firecrawl · E2B).
  // This is what lifts cold inbound scores off ~11 when socials/site exist.
  try {
    const profilePack = await enrichFromProfile(founder, product);
    for (const sp of profilePack.signals) {
      await store.addSignal({
        entity_type: "founder",
        entity_id: founderId,
        source: sp.source,
        url: sp.url,
        payload: sp.payload,
        observed_at: new Date().toISOString(),
      });
    }
    // Persist discovered GH handle if missing
    if (profilePack.github_repo && !founder.handles.github) {
      const owner = profilePack.github_repo.split("/")[0];
      if (owner) {
        await store.upsertFounder({
          id: founderId,
          name: founder.name,
          handles: { ...founder.handles, github: owner },
        });
      }
    }
    await step(
      run_id,
      "profile_enrich",
      {
        providers: profilePack.providers_used,
        signals: profilePack.signals.length,
        github_repo: profilePack.github_repo,
      },
      {
        errors: profilePack.errors,
        evidence_n: profilePack.evidence.length,
      },
      profilePack.evidence,
      store,
    );
  } catch (e) {
    await step(
      run_id,
      "profile_enrich",
      { founder_id: founderId },
      { ok: false },
      [e instanceof Error ? e.message : "profile enrich failed"],
      store,
    );
  }

  // Multi-agent enrichment — scoped API endpoints per role (E2B / GH / Tavily / Firecrawl / SM / HN).
  let agents: AgentFleetResult | undefined;
  try {
    // Re-load founder after profile enrich (handles may have updated)
    const founderNow = (await store.getFounder(founderId)) ?? founder;
    agents = await runAgentLanes({
      founder: founderNow,
      product,
      claims: founderNow.claims,
    });
    for (const lane of agents.lanes) {
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
    await step(
      run_id,
      "agent_lanes",
      {
        roles: agents.lanes.map((l) => l.role),
        providers: agents.providers_used,
      },
      {
        ok_count: agents.ok_count,
        total_latency_ms: agents.total_latency_ms,
        sandboxes: agents.lanes
          .filter((l) => l.sandbox_id)
          .map((l) => ({ role: l.role, sandbox_id: l.sandbox_id })),
        lanes: agents.lanes.map((l) => ({
          role: l.role,
          ok: l.ok,
          providers: l.providers,
          evidence_n: l.evidence.length,
          error: l.error,
          latency_ms: l.latency_ms,
        })),
      },
      agents.lanes.flatMap((l) =>
        l.evidence.slice(0, 6).map((e) => `[${l.role}] ${e}`),
      ),
      store,
    );
  } catch (e) {
    await step(
      run_id,
      "agent_lanes",
      { founder_id: founderId },
      { ok: false },
      [e instanceof Error ? e.message : "agent lanes failed"],
      store,
    );
  }

  // Deep research orchestration — multi-search → cite-bound synthesis → dossier.
  let research: ResearchDossier | undefined;
  try {
    const signalsForResearch = await store.getSignalsFor(founderId);
    const founderForResearch =
      (await store.getFounder(founderId)) ?? founder;
    research = await runDeepResearch({
      founder: founderForResearch,
      product,
      signals: signalsForResearch,
      run_id,
      store,
      budgetMs: Number(process.env.DEEP_RESEARCH_TIMEOUT_MS) || 55_000,
      maxScrapes: Number(process.env.DEEP_RESEARCH_MAX_SCRAPES) || 5,
    });
  } catch (e) {
    await step(
      run_id,
      "deep_research_synthesize",
      { founder_id: founderId },
      { ok: false },
      [e instanceof Error ? e.message : "deep research failed"],
      store,
    );
  }

  // Re-load signals after lane + research merges.
  const signalsAfter = await store.getSignalsFor(founderId);
  const gravity = scoreGravityFromSignals(signalsAfter);
  const sources = new Set(signalsAfter.map((s) => s.source)).size;
  const score = composeFounderScoreFromGravity(gravity, {
    coherence: coherenceFromSignals(sources),
    track_record: inferTrackRecord(founder),
  });

  await step(
    run_id,
    "distribution_gravity",
    { founder_id: founderId },
    {
      gravity: gravity.gravity_score,
      founder_score: score.founder_score,
      cold_start: score.cold_start,
      coherence: coherenceFromSignals(sources),
      signals: signalsAfter.length,
    },
    gravity.evidence,
    store,
  );

  const updated = await store.upsertFounder({
    ...founder,
    founder_score: score.founder_score,
    score_confidence: score.score_confidence,
    gravity,
  });

  const claimInputs = dedupeClaims([
    ...updated.claims,
    ...(product?.traction_claims ?? []),
  ]);
  const evaluated = evaluateClaims(claimInputs, signalsAfter, product);

  await step(
    run_id,
    "trust_claims",
    { count: claimInputs.length },
    {
      evaluated: evaluated.length,
      contradictions: evaluated.filter((c) => c.contradiction).length,
    },
    evaluated
      .filter((c) => c.contradiction)
      .map((c) => c.contradiction_note ?? c.text),
    store,
  );

  const validation = validateClaims(evaluated, signalsAfter, product);
  let claims = validation.validated;

  await step(
    run_id,
    "validator",
    { claims_in: evaluated.length },
    {
      validated: claims.length,
      corrected: validation.corrected,
      flags: validation.flags.length,
    },
    validation.flags.length
      ? validation.flags
      : ["No validator flags — claims consistent with observables"],
    store,
  );

  // URL diligence — verify claims that cite http(s) evidence (max 3, best-effort).
  const urlCandidates = claims
    .filter((c) => c.evidence_url && /^https?:\/\//i.test(c.evidence_url))
    .slice(0, 3);
  if (urlCandidates.length > 0) {
    try {
      const ledger = await executeAutomatedDiligence(
        urlCandidates.map((c, i) => ({
          id: `c${i}`,
          assertionText: c.text,
          claimedSourceUrl: c.evidence_url!,
        })),
      );
      const byText = new Map(
        urlCandidates.map((c, i) => [c.text, ledger[i]!]),
      );
      claims = claims.map((c) => {
        const rec = byText.get(c.text);
        if (!rec) return c;
        if (!rec.isValidated) {
          return {
            ...c,
            confidence: Math.min(c.confidence, 0.35),
            contradiction: true,
            contradiction_note:
              c.contradiction_note ??
              `URL diligence: source does not support claim — ${rec.extractedProofSnippet.slice(0, 160)}`,
          };
        }
        return {
          ...c,
          confidence: Math.max(c.confidence, Math.min(0.9, rec.confidenceBand)),
        };
      });
      await step(
        run_id,
        "url_diligence",
        { checked: ledger.length },
        {
          validated: ledger.filter((r) => r.isValidated).length,
          failed: ledger.filter((r) => !r.isValidated).length,
        },
        ledger.map(
          (r) =>
            `${r.isValidated ? "OK" : "FAIL"} ${r.sourceUrl}: ${r.extractedProofSnippet.slice(0, 120)}`,
        ),
        store,
      );
    } catch (e) {
      await step(
        run_id,
        "url_diligence",
        { checked: urlCandidates.length },
        { ok: false },
        [e instanceof Error ? e.message : "url diligence failed"],
        store,
      );
    }
  }

  // Persist evaluated claims on the founder (Memory never forgets Trust state).
  const withClaims = await store.upsertFounder({
    ...updated,
    claims,
  });

  const screening = screenAxes({
    founder: withClaims,
    product,
    thesis: activeThesis,
    history,
    claims,
  });
  await store.saveScreening(screening);

  await step(
    run_id,
    "three_axis_screen",
    { axes: ["founder", "market", "idea"], averaged: false },
    {
      founder_axis: screening.founder_axis.score,
      market_axis: screening.market_axis.score,
      idea_axis: screening.idea_axis.score,
    },
    ["Three axes scored independently — never averaged"],
    store,
  );

  const memo = buildMemo({
    founder: withClaims,
    product,
    screening,
    thesis: activeThesis,
    claims,
    research: research
      ? {
          findings: research.findings,
          open_questions: research.open_questions,
          synthesis: research.synthesis,
          partial: research.partial,
          provider_status: research.provider_status,
        }
      : null,
  });
  await store.saveMemo(memo);

  await step(
    run_id,
    "memo_decision",
    { founder_id: founderId },
    {
      decision: memo.decision,
      decision_conf: memo.decision_conf,
      gaps: memo.gaps,
      research_findings: research?.findings.length ?? 0,
      research_partial: research?.partial ?? null,
    },
    [`$100K decision: ${memo.decision}`, ...memo.gaps.slice(0, 3)],
    store,
  );

  return {
    run_id,
    founder: withClaims,
    product,
    screening,
    memo,
    claims,
    first_pass,
    validator: {
      flags: validation.flags,
      corrected: validation.corrected,
    },
    agents,
    research,
  };
}
