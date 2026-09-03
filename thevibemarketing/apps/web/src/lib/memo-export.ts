import type { Memo, Screening } from "@vibe/engine";

export type MemoExportInput = {
  founderName: string;
  memo: Memo;
  screening?: Screening | null;
  funnelClock?: string | null;
  siteUrl?: string;
};

function confPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function axisLine(
  label: string,
  axis: Screening["founder_axis"] | undefined,
): string {
  if (!axis) return `${label}: n/a`;
  return `${label}: ${Math.round(axis.score)}/100 (${axis.label}, ${axis.trend}, conf ${confPct(axis.confidence)}) — ${axis.rationale}`;
}

/** Short chip for IC Slack / notes. */
export function formatDecisionSummary(input: MemoExportInput): string {
  const { founderName, memo } = input;
  const lines = [
    `$100K ${memo.decision.toUpperCase()} · conf ${confPct(memo.decision_conf)} · ${founderName || "Founder"}`,
  ];
  const contradiction = memo.claims.find((c) => c.contradiction);
  if (contradiction) {
    lines.push(contradiction.text);
    if (contradiction.contradiction_note) {
      lines.push(contradiction.contradiction_note);
    }
  }
  if (memo.gaps.length) {
    lines.push(`Gaps: ${memo.gaps.slice(0, 3).join("; ")}`);
  }
  return lines.join("\n");
}

/** Full plain-text / markdown memo for clipboard or .md download. */
export function formatMemoMarkdown(input: MemoExportInput): string {
  const { founderName, memo, screening, funnelClock, siteUrl } = input;
  const generated = new Date(memo.created_at).toISOString();
  const blocks: string[] = [
    `# Investment memo — ${founderName || "Founder"}`,
    "",
    `**$100K decision-support:** ${memo.decision.toUpperCase()}`,
    `**Confidence:** ${confPct(memo.decision_conf)}`,
    funnelClock ? `**Funnel clock:** ${funnelClock}` : null,
    `**Generated:** ${generated}`,
    siteUrl ? `**Source:** ${siteUrl}` : null,
    "",
    "_Decision-support for a human investor — not an investment offer or automated wire._",
    "",
    "## Gaps · due diligence first",
    ...memo.gaps.map((g) => `- ${g}`),
    "",
  ].filter((x): x is string => x != null);

  if (screening) {
    blocks.push(
      "## Three axes — not averaged",
      "",
      axisLine("Founder", screening.founder_axis),
      axisLine("Market", screening.market_axis),
      axisLine("Idea vs Market", screening.idea_axis),
      "",
    );
  }

  if (memo.claims.length) {
    blocks.push("## Diligence · Trust claims", "");
    for (const c of memo.claims) {
      const flag = c.contradiction ? " ⚠ CONTRADICTION" : "";
      blocks.push(
        `- ${c.text} — trust ${confPct(c.confidence)}${flag}`,
      );
      if (c.evidence_url) blocks.push(`  - Evidence: ${c.evidence_url}`);
      if (c.contradiction_note) blocks.push(`  - Note: ${c.contradiction_note}`);
    }
    blocks.push("");
  }

  blocks.push("## Appendix sections", "");
  for (const s of memo.sections) {
    blocks.push(`### ${s.title}${s.required ? " (required)" : ""}`, "", s.body, "");
  }

  blocks.push(
    "---",
    `vibemarketer · VC Brain · memo \`${memo.id}\``,
  );

  return blocks.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function preBlock(body: string): string {
  return `<pre style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#334;margin:0.5rem 0 0;">${escapeHtml(body)}</pre>`;
}

/** Self-contained HTML document for print → Save as PDF. */
export function formatMemoHtml(input: MemoExportInput): string {
  const { founderName, memo, screening, funnelClock, siteUrl } = input;
  const decisionColor =
    memo.decision === "yes"
      ? "#15803d"
      : memo.decision === "no"
        ? "#b91c1c"
        : "#a16207";

  const axesHtml = screening
    ? `
    <h2>Three axes — not averaged</h2>
    <p class="muted">Independent Founder / Market / Idea scores — never averaged.</p>
    <table>
      <thead><tr><th>Axis</th><th>Score</th><th>Label</th><th>Rationale</th></tr></thead>
      <tbody>
        <tr>
          <td>Founder</td>
          <td>${Math.round(screening.founder_axis.score)}</td>
          <td>${escapeHtml(screening.founder_axis.label)}</td>
          <td>${escapeHtml(screening.founder_axis.rationale)}</td>
        </tr>
        <tr>
          <td>Market</td>
          <td>${Math.round(screening.market_axis.score)}</td>
          <td>${escapeHtml(screening.market_axis.label)}</td>
          <td>${escapeHtml(screening.market_axis.rationale)}</td>
        </tr>
        <tr>
          <td>Idea vs Market</td>
          <td>${Math.round(screening.idea_axis.score)}</td>
          <td>${escapeHtml(screening.idea_axis.label)}</td>
          <td>${escapeHtml(screening.idea_axis.rationale)}</td>
        </tr>
      </tbody>
    </table>`
    : "";

  const claimsHtml = memo.claims.length
    ? `<h2>Diligence · Trust claims</h2>
      <ul>${memo.claims
        .map((c) => {
          const note = c.contradiction_note
            ? `<div class="danger">${escapeHtml(c.contradiction_note)}</div>`
            : "";
          const url = c.evidence_url
            ? `<div class="muted"><a href="${escapeHtml(c.evidence_url)}">${escapeHtml(c.evidence_url)}</a></div>`
            : "";
          return `<li>
            <strong>${escapeHtml(c.text)}</strong>
            — trust ${confPct(c.confidence)}${c.contradiction ? " · CONTRADICTION" : ""}
            ${url}${note}
          </li>`;
        })
        .join("")}</ul>`
    : "";

  const gapsHtml = memo.gaps
    .map((g) => `<li>${escapeHtml(g)}</li>`)
    .join("");

  const sectionsHtml = memo.sections
    .map(
      (s) => `
      <section class="section">
        <h3>${escapeHtml(s.title)}${s.required ? ' <span class="tag">required</span>' : ""}</h3>
        ${preBlock(s.body)}
      </section>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Memo · ${escapeHtml(founderName || "Founder")} · $100K ${escapeHtml(memo.decision.toUpperCase())}</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #0b0d10;
      line-height: 1.45;
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
      font-size: 13px;
    }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
    h2 { font-size: 15px; margin: 1.4rem 0 0.4rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    h3 { font-size: 13px; margin: 0; }
    .muted { color: #64748b; font-size: 12px; }
    .danger { color: #b91c1c; font-size: 12px; margin-top: 4px; }
    .decision {
      border: 2px solid ${decisionColor};
      color: ${decisionColor};
      border-radius: 12px;
      padding: 16px 18px;
      margin: 16px 0;
    }
    .decision .big {
      font-size: 36px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: -0.03em;
      margin: 4px 0;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
    li { margin: 0.25rem 0; }
    .section {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 10px 0;
      break-inside: avoid;
    }
    .tag { font-size: 10px; color: #94a3b8; font-family: ui-monospace, monospace; text-transform: uppercase; }
    .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="muted no-print">Use your browser’s Print → <strong>Save as PDF</strong>. This page is print-optimized.</p>
  <h1>Investment memo — ${escapeHtml(founderName || "Founder")}</h1>
  <p class="muted">VC Brain · $100K decision-support${siteUrl ? ` · ${escapeHtml(siteUrl)}` : ""}</p>

  <div class="decision">
    <div class="muted">$100K decision-support</div>
    <div class="big">${escapeHtml(memo.decision)}</div>
    <div>Confidence ${confPct(memo.decision_conf)}${funnelClock ? ` · ${escapeHtml(funnelClock)}` : ""}</div>
    <p class="muted" style="margin:8px 0 0;color:inherit;opacity:0.85;">
      Decision-support for a human investor — not an investment offer or automated wire.
      Gaps are honest unknowns, not invented numbers.
    </p>
  </div>

  <h2>Gaps · due diligence first</h2>
  <ul>${gapsHtml || "<li>None listed</li>"}</ul>

  ${axesHtml}
  ${claimsHtml}

  <h2>Appendix sections</h2>
  ${sectionsHtml}

  <div class="footer">
    Generated ${escapeHtml(new Date(memo.created_at).toISOString())} · memo ${escapeHtml(memo.id)} · vibemarketer VC Brain
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

export function slugifyFounder(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "founder";
}
