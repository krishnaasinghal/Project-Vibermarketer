export type Feature = {
  id: string;
  name: string;
  tagline: string;
  body: string;
  href?: string;
  hrefLabel?: string;
  status: "live" | "app" | "addon";
};

/** Marketing product features — homepage + /product share this list. */
export const FEATURES: Feature[] = [
  {
    id: "brand-memory",
    name: "Brand memory",
    tagline: "URL in. Voice, ICP, pillars out.",
    body: "Onboard with a product or business URL. We extract ICP, tone, and pillars for SaaS, startups, and MSMEs so every draft stays on-voice.",
    href: "/app/onboarding",
    hrefLabel: "Start onboarding",
    status: "app",
  },
  {
    id: "agent-fleet",
    name: "Agent fleet (AI CMO wall)",
    tagline: "Named workflows. HITL control. Provider-confirmed publishing.",
    body: "Named workflows with honest status: brand intake, social drafts, Reddit/HN/SEO (live); Writer/GEO/publish/analyst (partial); experimental agents later. Cursor-like HITL + saved brand context.",
    href: "/product#fleet",
    hrefLabel: "See fleet",
    status: "live",
  },
  {
    id: "operating-loop",
    name: "Operating loop",
    tagline: "CONTEXT → PLAN → CREATE → APPROVE → PUBLISH → REVIEW",
    body: "One focused loop from product context to approved campaigns and reviewable outcomes. Not a calendar. Not a chat box. Work moves through clear stages with human approval.",
    href: "/product#loop",
    hrefLabel: "How it works",
    status: "live",
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "Drafts from brand context.",
    body: "Generate a 7-day campaign brief plus channel-ready posts from memory — X, LinkedIn, Reddit. Edit in the HITL queue before live publish. L2 can auto-queue X/LinkedIn drafts only. Google Business Profile coming soon.",
    href: "/app/studio",
    hrefLabel: "Open Studio",
    status: "app",
  },
  {
    id: "hitl-queue",
    name: "HITL approval queue",
    tagline: "Autonomy with a human gate.",
    body: "Set how far agents can go per channel. High-risk engages always stop. Approve or reject drafts before they hit the wire.",
    href: "/app/queue",
    hrefLabel: "Open queue",
    status: "app",
  },
  {
    id: "connectors",
    name: "Connectors",
    tagline: "OAuth when you need it.",
    body: "Reddit, X, and LinkedIn via managed OAuth. Approve first — publish only after a real provider post ID. Google Business Profile coming soon (labeled).",
    href: "/app/connectors",
    hrefLabel: "Connect accounts",
    status: "live",
  },
  {
    id: "seo-aeo",
    name: "SEO / AEO",
    tagline: "Rankings and LLM citations.",
    body: "Structure, guides, sitemap, robots, and llms.txt so humans and models can find you. Distribution includes being citeable.",
    href: "/llms.txt",
    hrefLabel: "View llms.txt",
    status: "live",
  },
  {
    id: "sandbox-security",
    name: "Sandboxed execution",
    tagline: "Untrusted data never becomes a tool call.",
    body: "Scraped pages, decks, and skill files are stored and cited as data. HITL gates every live post; generation and approve paths are rate-limited per workspace so one session cannot drain providers.",
    href: "/product#trust",
    hrefLabel: "Security posture",
    status: "live",
  },
];

/**
 * Compact fleet roles for homepage.
 * Full AI-CMO-style wall (Okara parity list) lives in @vibe/engine MARKETING_AGENT_CATALOG
 * and GET /api/marketing/agents.
 */
export const FLEET_ROLES = [
  {
    role: "Brand + Memory",
    job: "URL → durable brand memory (core / semantic / episodic).",
  },
  {
    role: "Strategist",
    job: "Owns goals, calendar, and channel mix from brand memory.",
  },
  {
    role: "Writer + Social",
    job: "Long-form and channel drafts (X · LinkedIn · Reddit) in your voice.",
  },
  {
    role: "Reddit / HN",
    job: "Opportunity loops: find threads, draft helpful replies for HITL.",
  },
  {
    role: "SEO + GEO",
    job: "Keyword drafts, rankings, and LLM citations (llms.txt / schema).",
  },
  {
    role: "Distributor + HITL",
    job: "Approve → publish only with real provider post IDs.",
  },
  {
    role: "Analyst",
    job: "Reviews published work; GSC/GA and attribution next.",
  },
  {
    role: "UGC / Video (later)",
    job: "Short-form briefs and clips are planned after the core loop is proven.",
  },
] as const;

/** Status labels for agent wall UI */
export const AGENT_STATUS_LABEL: Record<string, string> = {
  live: "Live",
  partial: "Partial",
  next: "Building next",
  soon: "Soon",
  later: "Later",
};
