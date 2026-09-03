import { randomUUID } from 'node:crypto';
import { ownershipToPercent } from '../thesis';
import type {
  AxisScore,
  Claim,
  Decision,
  Memo,
  MemoBuildInput,
  MemoSection,
  Screening,
  Thesis,
} from '../types';

const REQUIRED_KEYS = [
  'company_snapshot',
  'investment_hypotheses',
  'swot',
  'problem_product',
  'traction_kpis',
] as const;

function axisLine(name: string, a: AxisScore): string {
  return `${name}: ${a.score.toFixed(0)}/100 (${a.label}, ${a.trend}, conf ${(a.confidence * 100).toFixed(0)}%)${a.abstain ? ' [ABSTAIN]' : ''} — ${a.rationale}`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function riskBand(risk: string): 'conservative' | 'moderate' | 'aggressive' {
  const r = risk.toLowerCase();
  if (r.includes('conserv') || r === 'low') return 'conservative';
  if (r.includes('aggress') || r === 'high') return 'aggressive';
  return 'moderate';
}

/**
 * $100K decision from three independent axes + thesis + trust.
 * NEVER averages axes into a single screening score for storage.
 */
export function decide100k(
  screening: Screening,
  claims: Claim[],
  thesis?: Thesis | null,
): { decision: Decision; decision_conf: number; rationale: string } {
  const f = screening.founder_axis;
  const m = screening.market_axis;
  const i = screening.idea_axis;
  const contradictions = claims.filter((c) => c.contradiction).length;
  const avgClaimConf =
    claims.length > 0
      ? claims.reduce((s, c) => s + c.confidence, 0) / claims.length
      : 0.5;

  const anyAbstain = Boolean(f.abstain || m.abstain || i.abstain);
  const strong = [f, m, i].filter((a) => a.score >= 65 && !a.abstain).length;
  const weak = [f, m, i].filter((a) => a.score < 40).length;
  const spread = Math.max(f.score, m.score, i.score) - Math.min(f.score, m.score, i.score);

  let decision: Decision = 'watch';
  let decision_conf = 0.5;
  let rationale = '';

  // Any material Trust contradiction kills a $100K decision-support YES.
  if (contradictions >= 1) {
    decision = 'no';
    decision_conf = contradictions >= 2 || avgClaimConf < 0.4 ? 0.78 : 0.7;
    rationale = `${contradictions} material claim contradiction(s); trust too low for a $100K recommendation`;
  } else if (weak >= 2 && !anyAbstain) {
    decision = 'no';
    decision_conf = 0.65;
    rationale = `Two or more axes weak (F=${f.score.toFixed(0)} M=${m.score.toFixed(0)} I=${i.score.toFixed(0)})`;
  } else if (strong >= 2 && f.score >= 60 && contradictions === 0 && !anyAbstain) {
    decision = 'yes';
    decision_conf = clamp01(0.55 + 0.1 * strong + 0.15 * avgClaimConf);
    rationale = `Two+ axes strong with clean claims; founder axis ${f.score.toFixed(0)}`;
  } else if (spread >= 30) {
    decision = 'watch';
    decision_conf = 0.55;
    rationale = `Axis disagreement (spread ${spread.toFixed(0)}) — hold for more diligence`;
  } else {
    decision = 'watch';
    decision_conf = anyAbstain ? 0.4 : 0.5;
    rationale = anyAbstain
      ? 'One or more axes abstained — insufficient signal for conviction'
      : 'Mixed axes; watch for traction or thesis fit updates';
  }

  // Thesis knobs must change outcomes — not cosmetic UI only.
  if (thesis && decision !== 'no') {
    const band = riskBand(thesis.risk);
    const ownershipPct = ownershipToPercent(thesis.ownership_target);
    const check = thesis.check_size;

    if (decision === 'yes' && band === 'conservative' && strong < 3) {
      decision = 'watch';
      decision_conf = 0.55;
      rationale = `Thesis risk=conservative — need all 3 axes strong (have ${strong}; F=${f.score.toFixed(0)}); was YES candidate`;
    }

    if (
      decision === 'watch' &&
      band === 'aggressive' &&
      contradictions === 0 &&
      !anyAbstain &&
      weak === 0 &&
      strong >= 1 &&
      f.score >= 55
    ) {
      decision = 'yes';
      decision_conf = 0.58;
      rationale = `Thesis risk=aggressive — lean YES on founder ${f.score.toFixed(0)} with ${strong} strong axis`;
    }

    // High ownership target at small check implies stretch valuation / weak leverage.
    if (decision === 'yes' && ownershipPct >= 12 && f.score < 55) {
      decision = 'watch';
      decision_conf = 0.52;
      rationale = `Thesis ownership ${ownershipPct.toFixed(1)}% at $${check.toLocaleString()} needs stronger founder axis (F=${f.score.toFixed(0)})`;
    }

    if (decision === 'yes' && check > 150_000 && f.score < 65) {
      decision = 'watch';
      decision_conf = 0.5;
      rationale = `Thesis check $${check.toLocaleString()} above typical $100K bar — founder axis ${f.score.toFixed(0)} not yet enough`;
    }

    rationale += ` · thesis pressure: risk=${thesis.risk}, check=$${check.toLocaleString()}, ownership=${ownershipPct.toFixed(1)}%`;
  }

  return { decision, decision_conf, rationale };
}

/**
 * Build an evidence-backed memo from structured data (offline-capable, no LLM).
 */
export function buildMemo(input: MemoBuildInput): Memo {
  const {
    founder,
    product,
    screening,
    thesis,
    claims: inputClaims,
    extra_gaps,
    research,
  } = input;
  const claims = inputClaims ?? [...founder.claims, ...(product?.traction_claims ?? [])];
  const gaps: string[] = [...(extra_gaps ?? [])];

  if (!product) gaps.push('Product: not attached to this founder opportunity');
  if (!product?.sector) gaps.push('Sector: not disclosed');
  if (!product?.stage) gaps.push('Stage: not disclosed');
  if (!product?.domain) gaps.push('Domain / website: not disclosed');
  gaps.push('Cap table: not disclosed');
  gaps.push('Financials & round structure: not disclosed');
  gaps.push('Customer references: unavailable at this stage');
  if (!founder.bio) gaps.push('Founder bio: thin / not disclosed');
  if (founder.gravity?.abstain) {
    gaps.push(
      `Distribution gravity: abstained — ${founder.gravity.abstain_reason ?? 'thin signal'}`,
    );
  }
  for (const q of research?.open_questions ?? []) {
    if (!gaps.includes(q)) gaps.push(q);
  }

  const { decision, decision_conf, rationale } = decide100k(screening, claims, thesis);

  const companyName = product?.name ?? `${founder.name}'s venture`;
  const sector = product?.sector ?? 'sector not disclosed';
  const stage = product?.stage ?? 'stage not disclosed';

  const sections: MemoSection[] = [
    {
      key: 'company_snapshot',
      title: 'Company snapshot',
      required: true,
      body: [
        `${companyName} (${sector}, ${stage}).`,
        product?.oneliner
          ? `In a nutshell: ${product.oneliner}`
          : 'In a nutshell: product one-liner not disclosed.',
        `Founder ${founder.name} — Founder Score ${(founder.founder_score ?? 0).toFixed(1)} (conf ${((founder.score_confidence ?? 0) * 100).toFixed(0)}%), distribution gravity ${(founder.gravity?.gravity_score ?? 0).toFixed(1)}.`,
        thesis
          ? `Screened against thesis: sectors [${thesis.sectors.join(', ')}], stage ${thesis.stage}, geo ${thesis.geo}, check $${thesis.check_size.toLocaleString()}.`
          : 'No fund thesis configured — scores are thesis-agnostic.',
      ].join(' '),
    },
    {
      key: 'investment_hypotheses',
      title: 'Investment hypotheses',
      required: true,
      body: [
        `• Team / distribution: gravity ${(founder.gravity?.gravity_score ?? 0).toFixed(0)} with evidence — ${(founder.gravity?.evidence ?? []).slice(0, 2).join('; ') || 'limited'}`,
        `• Founder axis: ${screening.founder_axis.score.toFixed(0)} (${screening.founder_axis.label}, ${screening.founder_axis.trend})`,
        `• Market axis: ${screening.market_axis.score.toFixed(0)} (${screening.market_axis.label}) — ${screening.market_axis.rationale}`,
        `• Idea-vs-market: ${screening.idea_axis.score.toFixed(0)} (${screening.idea_axis.label}) — ${screening.idea_axis.rationale}`,
        `• $100K lean: ${decision.toUpperCase()} — ${rationale}`,
      ].join('\n'),
    },
    {
      key: 'swot',
      title: 'SWOT',
      required: true,
      body: [
        `Strengths: ${(founder.gravity?.gravity_score ?? 0) >= 55 ? 'earns attention relative to network (distribution gravity)' : 'limited public strength so far'}; Founder Score ${(founder.founder_score ?? 0).toFixed(0)}`,
        `Weaknesses: ${claims.filter((c) => c.contradiction).map((c) => c.contradiction_note).join('; ') || 'no flagged claim contradictions'}; cap table opaque`,
        `Opportunities: ${product?.sector ? `wedge in ${product.sector}` : 'sector undefined — exploration needed'}; cold-start-friendly scoring does not zero first-time founders`,
        `Threats: ${screening.market_axis.score < 45 ? 'thesis/market fit weak' : 'competitive density unknown'}; public-signal scoring can miss private traction`,
      ].join('\n'),
    },
    {
      key: 'problem_product',
      title: 'Problem & product',
      required: true,
      body: product?.oneliner
        ? `Problem/product framing (from founder materials): ${product.oneliner}. Domain: ${product.domain ?? 'not disclosed'}. Deep product walkthrough: not available from public signals — flagged as a diligence gap.`
        : 'Problem & product: not disclosed. Flagged for inbound deck / founder interview.',
    },
    {
      key: 'traction_kpis',
      title: 'Traction & KPIs',
      required: true,
      body:
        claims.length > 0
          ? claims
              .map((c) => {
                const flag = c.contradiction ? ' ⚠ CONTRADICTION' : '';
                const ev = c.evidence_url ? ` [${c.evidence_url}]` : ' [no evidence url]';
                return `• [${c.category}] ${c.text} — trust ${(c.confidence * 100).toFixed(0)}%${flag}${c.contradiction_note ? ` — ${c.contradiction_note}` : ''}${ev}`;
              })
              .join('\n')
          : 'Traction & KPIs: not disclosed. No claims available to score.',
    },
    {
      key: 'team_history',
      title: 'Team & history',
      required: false,
      body: [
        `Founder: ${founder.name}`,
        founder.bio ? `Bio: ${founder.bio}` : 'Bio: not disclosed',
        `Handles: ${JSON.stringify(founder.handles)}`,
        `Links: ${(founder.links ?? []).join(', ') || 'none'}`,
      ].join('\n'),
    },
    {
      key: 'technology_defensibility',
      title: 'Technology & defensibility',
      required: false,
      body:
        'Technology & defensibility: not disclosed at this stage. Proprietary vs commoditizable architecture, data moat, and model choices require founder interview / deck — flagged rather than guessed.',
    },
    {
      key: 'market_sizing',
      title: 'Market sizing',
      required: false,
      body: (() => {
        const marketFindings = (research?.findings ?? []).filter(
          (f) => f.topic === 'market' || f.topic === 'competition',
        );
        if (marketFindings.length > 0) {
          return [
            'Market notes from deep research (cite-bound — not invented TAM):',
            ...marketFindings.map(
              (f) =>
                `• [${f.support}] ${f.claim}${f.citations[0] ? ` — ${f.citations[0].url}` : ''}`,
            ),
            'TAM/SAM/SOM still not disclosed unless a citation states a figure.',
          ].join('\n');
        }
        return product?.sector
          ? `Market sizing: TAM/SAM/SOM not disclosed. Sector tag "${product.sector}" is a label only — no top-down or bottom-up sizing from public signals. Assumptions: unavailable.`
          : 'Market sizing: not disclosed. Sector unknown; TAM/SAM/SOM unavailable at this stage.';
      })(),
    },
    {
      key: 'competition',
      title: 'Competition',
      required: false,
      body: (() => {
        const comp = (research?.findings ?? []).filter(
          (f) => f.topic === 'competition',
        );
        if (comp.length > 0) {
          return [
            'Competition notes from deep research (only named when cited):',
            ...comp.map(
              (f) =>
                `• [${f.support}] ${f.claim}${f.citations[0] ? ` — ${f.citations[0].url}` : ''}`,
            ),
          ].join('\n');
        }
        return 'Competition: named competitor clusters unavailable from public Identify signals. Who could become a threat later: not disclosed — diligence open.';
      })(),
    },
    {
      key: 'financials',
      title: 'Financials & round structure',
      required: false,
      body: 'Financials & round structure: not disclosed. Historical/projected P&L, runway, and next-round timing unavailable — not fabricated.',
    },
    {
      key: 'cap_table',
      title: 'Cap table',
      required: false,
      body: 'Cap table: not disclosed. Pre-/post-round ownership and VSOP allocation unavailable at this stage.',
    },
    {
      key: 'due_diligence_log',
      title: 'Due diligence log',
      required: false,
      body: [
        'What was checked (automated):',
        '• Deep research orchestration — Tavily + Firecrawl (+ E2B when repo/key) → cite-bound synthesis',
        research
          ? `• Research providers: ${Object.entries(research.provider_status)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')} · synthesis=${research.synthesis}${research.partial ? ' · PARTIAL' : ''}`
          : '• Deep research: not run on this memo path',
        research && research.findings.length > 0
          ? `• Findings: ${research.findings.length} cite-bound notes`
          : null,
        '• Commercial / traction claims — per-claim Trust Score + contradiction flags',
        '• People / public footprint — distribution gravity, Founder Score, cold-start weight redistribution',
        '• Technical signals — GitHub/HN/arXiv source tags when present',
        '• URL diligence — evidence URLs verified when configured (Firecrawl path)',
        '• Validator agent — soft-corrects inflated claims vs observable signals',
        '',
        'Still open:',
        ...(research?.open_questions?.length
          ? research.open_questions.map((q) => `• ${q}`)
          : [
              '• Financial diligence — not disclosed',
              '• Legal / entity — not disclosed',
              '• Customer references — unavailable at this stage',
              '• Cap table / round structure — not disclosed',
            ]),
        '',
        `Claim count scored: ${claims.length}; contradictions: ${claims.filter((c) => c.contradiction).length}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      key: 'exit_perspective',
      title: 'Exit perspective',
      required: false,
      body: 'Exit perspective: not modeled. Check-size decision-support only ($100K) — no exit comps invented from public noise.',
    },
    {
      key: 'decision',
      title: '$100K decision',
      required: false,
      body: [
        `Decision: ${decision.toUpperCase()}`,
        `Confidence: ${(decision_conf * 100).toFixed(0)}%`,
        `Rationale: ${rationale}`,
        '',
        'Independent axes (NOT averaged):',
        axisLine('Founder', screening.founder_axis),
        axisLine('Market', screening.market_axis),
        axisLine('Idea vs Market', screening.idea_axis),
      ].join('\n'),
    },
  ];

  for (const key of REQUIRED_KEYS) {
    if (!sections.some((s) => s.key === key)) {
      sections.unshift({
        key,
        title: key,
        body: `${key}: not disclosed`,
        required: true,
      });
      gaps.push(`${key}: missing section filled with gap flag`);
    }
  }

  return {
    id: randomUUID(),
    founder_id: founder.id,
    product_id: product?.id,
    sections,
    decision,
    decision_conf,
    claims,
    gaps: [...new Set(gaps)],
    created_at: new Date().toISOString(),
  };
}
