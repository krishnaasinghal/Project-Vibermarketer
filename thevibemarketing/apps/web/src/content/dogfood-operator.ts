/**
 * Dogfood operator — Anand Vashishtha.
 * Prefetched via Firecrawl (0xanand.tech) + GitHub API (Anand-0037) + Tavily.
 * Use as form defaults / brand seed — not synthetic Maya/Jordan/Sam cast.
 */

export const DOGFOOD_OPERATOR = {
  name: "Anand Vashishtha",
  email: "anandcollege07@gmail.com",
  location: "Ghaziabad, Uttar Pradesh, India",
  x_url: "https://x.com/AnandVashisht15",
  x_handle: "AnandVashisht15",
  github_login: "Anand-0037",
  github_url: "https://github.com/Anand-0037",
  linkedin_url: "https://www.linkedin.com/in/anand-vashishtha-aba64b255/",
  calendly_url: "https://calendly.com/0xanand",
  portfolio_url: "https://www.0xanand.tech",
  bio: "AI + Web3 builder — agentic systems, on-chain agents, decentralized memory, hackathons.",
  education:
    "Dual-degree engineer (B.Tech CSE @ ABES · BS Data Science @ IIT Madras online), class of 2028.",
  highlight:
    "Synergi (synergi.agiwithai.com) — 1st place + $3,000, official x402 Stacks Challenge.",
  domains: [
    "https://synergi.agiwithai.com",
    "https://agiwithai.com",
    "https://kaggleingest.com",
    "https://0gskills.com",
    "https://www.a2zbtc.com",
    "https://www.shebtc.com",
  ],
  github_stats: {
    public_repos: 32,
    followers: 54,
    fetched_at: "2026-07-18T22:36:00.000Z",
  },
  /** Product we dogfood this fleet on. */
  product: {
    id: "f_anand_vashishtha",
    company: "vibemarketer",
    domain: "vibemarketer.fun",
    url: "https://www.vibemarketer.fun",
    repo: "https://github.com/Anand-0037/thevibemarketing",
    oneliner:
      "Paste your product URL. Get a brand brief, campaign plan, and drafts you approve.",
    sector: "AI marketing / developer tools",
    stage: "pre-seed",
  },
  /** Pre-cached brand memory (Firecrawl markdown of portfolio + product thesis). */
  brand: {
    url: "https://vibemarketer.fun",
    name: "vibemarketer",
    oneliner:
      "Cursor for marketing — brand brief, campaigns, and approval-gated drafts. Built by Anand Vashishtha (0xanand.tech).",
    icp: "Solo SaaS founders and small technical teams who ship fast but lack distribution — especially AI/Web3 builders",
    tone: "direct/technical, founder-native, no agency fluff — Anand's builder voice",
    pillars: [
      "distribution is the scarce asset",
      "HITL brand safety",
      "persistent brand memory",
      "agentic loops not chat assistants",
      "dogfood: Anand Vashishtha · @AnandVashisht15 · 0xanand.tech",
    ],
  },
  sources: {
    firecrawl: "https://www.0xanand.tech",
    github: "https://api.github.com/users/Anand-0037",
    tavily_hits: [
      "https://x.com/AnandVashisht15",
      "https://www.0xanand.tech",
      "https://peerlist.io/0xanand/posts",
      "https://dev.to/anandvashishtha",
    ],
  },
} as const;

export const DOGFOOD_FOUNDER_ID = DOGFOOD_OPERATOR.product.id;
