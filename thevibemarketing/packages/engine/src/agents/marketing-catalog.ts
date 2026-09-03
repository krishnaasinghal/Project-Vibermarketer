/**
 * Marketing fleet agent catalog — honest status only.
 *
 * Status meanings:
 * - live     — end-to-end path exists in code; fails closed without required keys
 * - partial  — real code path but incomplete vs definitionOfDone
 * - next     — designed / queued, not shipped
 * - soon     — planned near-term
 * - later    — experimental / deferred
 *
 * Audit 2026-07-21: see packages/engine + apps/web/src/app/api/marketing/*
 */

export type MarketingAgentStatus =
  | "live"
  | "partial"
  | "next"
  | "soon"
  | "later";

export type MarketingAgentDef = {
  id: string;
  name: string;
  shortName: string;
  category:
    | "core"
    | "channel"
    | "content"
    | "growth"
    | "learn"
    | "media"
    | "experimental";
  job: string;
  /** What “done” looks like for this agent */
  definitionOfDone: string;
  status: MarketingAgentStatus;
  /** Code reality note (shown in honest UI) */
  honesty: string;
  /** App route or docs anchor when available */
  href?: string;
  /** Required env / providers for live path */
  requires?: string[];
  /** Okara-style peer for competitive honesty */
  peerOkara?: string;
};

export const MARKETING_AGENT_CATALOG: MarketingAgentDef[] = [
  {
    id: "brand-intake",
    name: "Brand intake",
    shortName: "Brand",
    category: "core",
    job: "Paste a product URL → structured brand memory (ICP, tone, pillars, never-say).",
    definitionOfDone:
      "Brand saved in marketing_state + SuperMemory container scoped to workspace.",
    status: "live",
    honesty:
      "Live: POST /api/brand — Firecrawl scrape + model extract + store + SuperMemory sync. Fails closed without Firecrawl/model.",
    href: "/app/onboarding",
    requires: ["FIRECRAWL_API_KEY", "OPENAI_API_KEY", "SUPERMEMORY_API_KEY"],
    peerOkara: "Growth Agent (site analyze)",
  },
  {
    id: "memory-keeper",
    name: "Memory keeper",
    shortName: "Memory",
    category: "core",
    job: "Layered core / semantic / episodic memory so context never resets.",
    definitionOfDone:
      "Recall returns core SoT + retrieval; HITL writes episodes.",
    status: "live",
    honesty:
      "Live: brand-memory layers + SuperMemory recall; approve/reject write episodes. Without SuperMemory, core brand fields still persist in Supabase.",
    href: "/app/memory",
    requires: ["SUPERMEMORY_API_KEY"],
  },
  {
    id: "strategist",
    name: "Strategist",
    shortName: "Strategy",
    category: "core",
    job: "Goals, channel mix, and 7-day campaign brief from brand memory.",
    definitionOfDone: "Campaign brief stored and editable before drafts run.",
    status: "live",
    honesty:
      "Live: POST /api/marketing/campaign — model + SuperMemory → 7-day brief stored. No static templates; fails closed without keys. Drafts still generated separately via Studio HITL.",
    href: "/app/studio",
    requires: ["OPENAI_API_KEY", "SUPERMEMORY_API_KEY"],
  },
  {
    id: "writer",
    name: "Writer",
    shortName: "Writer",
    category: "content",
    job: "Long-form articles and landing copy in brand voice.",
    definitionOfDone: "Long-form draft in HITL queue or markdown export.",
    status: "partial",
    honesty:
      "Partial: long-form is the SEO agent (blog draft → queue as LinkedIn-platform long text). No separate landing-page writer product surface yet.",
    href: "/app/studio",
    requires: ["OPENAI_API_KEY", "SUPERMEMORY_API_KEY"],
    peerOkara: "Writer Agent",
  },
  {
    id: "content-social",
    name: "Social content",
    shortName: "Social",
    category: "content",
    job: "Channel-ready short drafts (X, LinkedIn, Reddit) from memory.",
    definitionOfDone: "Three platform drafts pending in queue from one run.",
    status: "live",
    honesty:
      "Live: POST /api/marketing/draft — model + SuperMemory → 3 posts. L1 all pending; L2 auto-queues X/LinkedIn (not publish); Reddit stays pending. Fails closed without OpenAI/SuperMemory.",
    href: "/app/studio",
    requires: ["OPENAI_API_KEY", "SUPERMEMORY_API_KEY"],
    peerOkara: "X / LinkedIn agents",
  },
  {
    id: "agent-x",
    name: "X agent",
    shortName: "X",
    category: "channel",
    job: "Drafts and threads; publish only via connected account + provider post ID.",
    definitionOfDone: "Approve → Composio → status published with real id.",
    status: "partial",
    honesty:
      "Partial: drafts via social content; OAuth connect via Composio. Live publish only when account ACTIVE and provider returns post ID — not a dedicated “X agent” run button.",
    href: "/app/connectors",
    requires: ["COMPOSIO_API_KEY"],
    peerOkara: "X (Twitter) Agent",
  },
  {
    id: "agent-linkedin",
    name: "LinkedIn agent",
    shortName: "LinkedIn",
    category: "channel",
    job: "Professional posts and ideas; HITL then connected publish.",
    definitionOfDone: "Draft + optional Composio publish when account ACTIVE.",
    status: "partial",
    honesty:
      "Partial: same as X — draft path live; publish depends on Composio connection + provider confirm.",
    href: "/app/connectors",
    requires: ["COMPOSIO_API_KEY"],
    peerOkara: "LinkedIn Agent",
  },
  {
    id: "agent-reddit",
    name: "Reddit agent",
    shortName: "Reddit",
    category: "channel",
    job: "Find relevant threads; draft helpful replies for review (never spam auto-post).",
    definitionOfDone: "Opportunity list + draft reply queued with thread URL.",
    status: "live",
    honesty:
      "Live: runRedditAgent + POST /api/marketing/agents/reddit. Fail closed without OPENAI. Never auto-posts.",
    href: "/app/studio",
    requires: ["OPENAI_API_KEY"],
    peerOkara: "Reddit Agent",
  },
  {
    id: "agent-hn",
    name: "Hacker News agent",
    shortName: "HN",
    category: "channel",
    job: "Surface moments to share; draft comments for founder review.",
    definitionOfDone: "Rising/relevant stories + draft comment in queue.",
    status: "live",
    honesty:
      "Live: runHnAgent + POST /api/marketing/agents/hn. Fail closed without OPENAI. Never auto-posts.",
    href: "/app/studio",
    requires: ["OPENAI_API_KEY"],
    peerOkara: "Hacker News Agent",
  },
  {
    id: "seo",
    name: "SEO agent",
    shortName: "SEO",
    category: "content",
    job: "Keyword gaps, outlines, and blog drafts for approval.",
    definitionOfDone: "Keyword list + one drafted post outline/body in queue.",
    status: "live",
    honesty:
      "Live: runSeoAgent + optional Tavily research. Fail closed without OPENAI. Long-form stored as queue post (platform linkedin for body length).",
    href: "/app/studio",
    requires: ["OPENAI_API_KEY"],
    peerOkara: "SEO Agent",
  },
  {
    id: "geo",
    name: "GEO / AEO agent",
    shortName: "GEO",
    category: "growth",
    job: "Make the brand citeable by LLMs (structure, llms.txt, FAQ, schema).",
    definitionOfDone:
      "GEO scorecard + fix suggestions; citeable surfaces live.",
    status: "partial",
    honesty:
      "Partial: heuristic site scorecard (POST /api/marketing/site-audit) + recommendations. Does not auto-generate or deploy llms.txt/FAQ/schema onto the customer’s domain. vibemarketer’s own /llms.txt is separate.",
    href: "/app/onboarding",
    peerOkara: "GEO Agent",
  },
  {
    id: "distributor",
    name: "Distributor",
    shortName: "Publish",
    category: "core",
    job: "Execute approved posts through OAuth connectors; never invent post IDs.",
    definitionOfDone: "queued → published only with provider confirmation.",
    status: "partial",
    honesty:
      "Partial: approve → queued; confirmPublished only with real provider id (no synthetic ids). Live publish depends on Composio ACTIVE accounts. Per-owner publish rate limit on approve.",
    href: "/app/queue",
    requires: ["COMPOSIO_API_KEY"],
  },
  {
    id: "hitl",
    name: "HITL autonomy",
    shortName: "HITL",
    category: "core",
    job: "L1–L3 dial; human gate on brand-risk actions.",
    definitionOfDone: "Queue approve/reject; L3 blocked without live provider.",
    status: "live",
    honesty:
      "Live: queue edit/approve/reject + L1–L3 dial. L2 auto-queues low-risk social drafts only. L3 blocked. Generation + approve rate-limited per workspace.",
    href: "/app/queue",
  },
  {
    id: "analyst",
    name: "Analyst",
    shortName: "Analyst",
    category: "learn",
    job: "Report what shipped and what worked; feed LEARN.",
    definitionOfDone: "7d report from marketing_state; later GSC/GA.",
    status: "partial",
    honesty:
      "Partial: weekly rollup from marketing_state counts. No GSC/GA metrics until OAuth + tool pull is live.",
    href: "/app/report",
    peerOkara: "GSC + GA connectors",
  },
  {
    id: "ugc",
    name: "UGC / video",
    shortName: "UGC",
    category: "media",
    job: "Short-form briefs and clips for social (Remotion / templates).",
    definitionOfDone: "Exportable clip or brief from brand pillars.",
    status: "partial",
    honesty:
      "Partial: promo-video package + optional Grok Imagine creative on a draft. Not a full UGC agent fleet.",
    peerOkara: "UGC Videos Agent",
  },
  {
    id: "influencer",
    name: "Influencer",
    shortName: "Creators",
    category: "experimental",
    job: "Discover creators and draft outreach (always human-sent).",
    definitionOfDone: "Shortlist + outreach draft; no cold spam automation.",
    status: "later",
    honesty: "Not built — catalog placeholder only.",
    peerOkara: "Influencer Agent",
  },
  {
    id: "coding-seo",
    name: "Coding / tech SEO",
    shortName: "Code",
    category: "experimental",
    job: "Suggest technical SEO fixes (meta, schema) as reviewable diffs.",
    definitionOfDone: "PR or patch suggestions; never force-push to prod.",
    status: "later",
    honesty: "Not built — catalog placeholder only.",
    peerOkara: "Coding Agent",
  },
  {
    id: "link-broker",
    name: "Link broker",
    shortName: "Links",
    category: "experimental",
    job: "Backlink opportunities — high risk; last among growth agents.",
    definitionOfDone: "Manual opportunity list only until policy is clear.",
    status: "later",
    honesty: "Not built — deferred on purpose.",
    peerOkara: "Link Broker (Soon)",
  },
];

export function marketingAgentsByStatus(
  status: MarketingAgentStatus,
): MarketingAgentDef[] {
  return MARKETING_AGENT_CATALOG.filter((a) => a.status === status);
}

export function marketingAgentSummary(): Record<MarketingAgentStatus, number> {
  const out: Record<MarketingAgentStatus, number> = {
    live: 0,
    partial: 0,
    next: 0,
    soon: 0,
    later: 0,
  };
  for (const a of MARKETING_AGENT_CATALOG) out[a.status] += 1;
  return out;
}
