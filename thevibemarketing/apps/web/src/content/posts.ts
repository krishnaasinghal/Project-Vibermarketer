import { DOGFOOD_OPERATOR } from "@/content/dogfood-operator";

export type PostBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "callout"; text: string; tone?: "accent" | "muted" | "warn" }
  | { type: "ol"; items: string[] }
  | {
      type: "mermaid";
      code: string;
      title?: string;
      caption?: string;
    }
  | {
      type: "layers";
      layers: Array<{ name: string; detail: string; accent?: boolean }>;
      title?: string;
      caption?: string;
    }
  | {
      type: "pipeline";
      steps: Array<{ label: string; detail?: string }>;
      title?: string;
      caption?: string;
      orientation?: "auto" | "vertical";
    };

export type Post = {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  /** Plain paragraphs for RSS / feeds / fallback */
  body: string[];
  /** Rich article body — diagrams, headings, callouts */
  blocks?: PostBlock[];
  tag?: string;
  author?: string;
  /**
   * When false, post stays routable but is hidden from blog index / “more notes”.
   * Use for hackathon-era archive that would confuse the company story.
   */
  listed?: boolean;
};

function blocksToBody(blocks: PostBlock[]): string[] {
  return blocks
    .filter((b): b is { type: "p"; text: string } => b.type === "p")
    .map((b) => b.text);
}

export function postHasDiagram(post: Post): boolean {
  return Boolean(
    post.blocks?.some(
      (b) => b.type === "mermaid" || b.type === "layers" || b.type === "pipeline",
    ),
  );
}

export function postBlocks(post: Post): PostBlock[] {
  if (post.blocks?.length) return post.blocks;
  return post.body.map((text) => ({ type: "p" as const, text }));
}

const ENGINE_MARKETING = `
flowchart TB
  URL[Product URL] --> BR[Brand memory]
  BR --> PLAN[Campaign + channel plan]
  PLAN --> DR[Drafts X · LinkedIn · Reddit]
  DR --> HITL[HITL queue]
  HITL --> Q[Queued]
  Q --> PUB[Published only with provider ID]
  PUB --> LEARN[Report · learn]
  LEARN --> PLAN
`.trim();

const DUAL_WRITE = `
flowchart LR
  API[Next.js API routes] --> STORE[In-memory store]
  API --> PG[(Postgres dual-write)]
  STORE --> UI[Radar · Studio · Memo]
  PG --> UI
`.trim();

const FLEET_LOOP = `
flowchart LR
  S[SENSE] --> T[THINK]
  T --> C[CREATE]
  C --> G[GATE]
  G --> A[ACT]
  A --> L[LEARN]
  L --> S
`.trim();

const MEMORY_GRAPH = `
flowchart TB
  SIG[Signals · append-only] --> FS[Founder Score ledger]
  CLA[Claims · Trust] --> FS
  SCR[Screenings] --> MEMO[$100K memo]
  FS --> SCR
  CLA --> MEMO
  TR[Agent traces] --> MEMO
`.trim();

const GRAVITY_FLOW = `
flowchart LR
  PUB[Public surfaces] --> G[Gravity score]
  G --> C[Cadence]
  G --> CO[Coherence]
  G --> TR[Track record*]
  C --> FS[Founder Score]
  CO --> FS
  TR --> FS
`.trim();

export const posts: Post[] = [
  {
    title: "Inside the architecture: URL to approved draft",
    slug: "architecture-one-engine-two-heads",
    date: "2026-07-19",
    tag: "architecture",
    author: DOGFOOD_OPERATOR.name,
    excerpt:
      "How vibemarketer turns a product URL into brand memory, multi-channel drafts, and a HITL queue — with diagrams. No fake publish.",
    body: [],
    blocks: [
      {
        type: "p",
        text: "Most tools bolt AI onto a calendar or a CRM. We built the loop first: paste a product URL, extract brand memory, plan channels, draft posts, and hold every item for human approval before anything can publish.",
      },
      {
        type: "callout",
        tone: "accent",
        text: "Company product is vibemarketer — Cursor for marketing. The bet is simple: founders who can ship still need distribution, and distribution needs memory + HITL, not autopilot slop.",
      },
      { type: "h2", text: "System map" },
      {
        type: "mermaid",
        title: "Mermaid · marketing loop",
        caption:
          "One path. Published only after a connected provider returns a real post ID.",
        code: ENGINE_MARKETING,
      },
      {
        type: "layers",
        title: "Product layers",
        caption: "Memory · intelligence · experience for founder GTM.",
        layers: [
          {
            name: "Memory",
            detail:
              "Brand core, semantic, and episodic memory from your site — multi-tenant, Supabase as production truth.",
            accent: true,
          },
          {
            name: "Intelligence",
            detail:
              "Campaign briefs, Reddit/HN/SEO agents, and channel drafts grounded in brand context when a live model is configured.",
          },
          {
            name: "Experience",
            detail:
              "CMO desk → Studio → HITL queue → report. Fail closed if providers are down — no template drafts pretending to be real.",
          },
        ],
      },
      { type: "h2", text: "Persistence" },
      {
        type: "p",
        text: "Production marketing state lives in Supabase per workspace. We do not invent analytics or mark posts published without a provider confirmation.",
      },
      {
        type: "mermaid",
        title: "Mermaid · dual-write (optional tooling)",
        caption:
          "Marketing SaaS path is marketing_state. Other ledgers are optional infrastructure — not the company story.",
        code: DUAL_WRITE,
      },
      {
        type: "pipeline",
        title: "Pipeline · founder walkthrough",
        caption: "What a stranger should feel in under a minute.",
        steps: [
          { label: "URL", detail: "Public homepage" },
          { label: "Brand", detail: "Memory + scorecard" },
          { label: "Drafts", detail: "X · LinkedIn · Reddit" },
          { label: "HITL", detail: "Edit · approve · reject" },
          { label: "Publish", detail: "Real provider ID only" },
        ],
      },
      { type: "h2", text: "Why this shape" },
      {
        type: "ol",
        items: [
          "Brand context compounds — agents do not start from zero every session.",
          "HITL is the product: audiences filter AI spam; we never fake published.",
          "Depth lives in connectors + memory + review, not a single clever prompt.",
        ],
      },
      {
        type: "p",
        text: "If you only remember one picture: URL → memory → drafts → approve → real publish.",
      },
    ],
  },
  {
    title: "We built a VC Brain in 18 hours — then put it inside the product",
    slug: "vc-brain-in-18-hours",
    date: "2026-07-18",
    tag: "archive",
    author: DOGFOOD_OPERATOR.name,
    listed: false,
    excerpt:
      "Archive: a hackathon-era sourcing demo. The company product is vibemarketer (marketing loop), not investor tooling.",
    body: [],
    blocks: [
      {
        type: "callout",
        tone: "warn",
        text: "Archive note (2026): this post describes a Challenge 02 hackathon wedge. vibemarketer’s company product is the founder marketing loop — paste URL, get drafts, approve, publish for real. The sourcing demo remains available under /vc-brain for curious users, not as the homepage story.",
      },
      {
        type: "p",
        text: "Hackathons reward a sharp demo. We shipped an experimental sourcing path: thesis → multi-source ingest → gravity-style scoring → screening → evidence memo. Useful as engineering archaeology — not what we lead with for YC or customers.",
      },
      {
        type: "p",
        text: "What survived into the company: shared memory discipline, fail-closed providers, HITL gates, and dogfooding the product on ourselves. What did not become the lead story: positioning vibemarketer as two equal products.",
      },
      {
        type: "p",
        text: `If you are a technical founder drowning in “just post more,” start at /get-started or the app onboarding — not the archive path. — ${DOGFOOD_OPERATOR.name}`,
      },
    ],
  },
  {
    title: "Why your SaaS needs a newsletter before another growth hack",
    slug: "newsletter-before-growth-hacks",
    date: "2026-07-17",
    tag: "newsletter",
    author: DOGFOOD_OPERATOR.name,
    excerpt:
      "Rented audiences choke. Owned email compounds. Here's how the fleet treats newsletter as a first-class loop.",
    body: [],
    blocks: [
      {
        type: "p",
        text: "Algorithms change. Your email list does not — if you earn the open. For indie SaaS, a weekly distribution note beats another viral template that dies in 48 hours.",
      },
      {
        type: "pipeline",
        title: "Pipeline · owned attention",
        caption: "Capture → draft from brand memory → HITL → send → learn opens.",
        steps: [
          { label: "Capture", detail: "Waitlist + source tag" },
          { label: "Draft", detail: "Brand memory voice" },
          { label: "Gate", detail: "HITL at L1" },
          { label: "Send", detail: "Owned inbox" },
          { label: "Learn", detail: "ESP analytics later" },
        ],
      },
      {
        type: "p",
        text: "Inside vibemarketer, newsletter is not a bolted-on form. Captures feed the same waitlist store with a source tag; drafts pull brand memory; HITL still gates send when autonomy is L1.",
      },
      {
        type: "mermaid",
        title: "Mermaid · fleet loop",
        caption: "Newsletter is CREATE + GATE + ACT on a slower cadence — not a separate product.",
        code: FLEET_LOOP,
      },
      {
        type: "callout",
        tone: "muted",
        text: "Start simple: one promise (distribution notes for builders), one cadence, one unsubscribe that actually works. Then let LEARN improve subject lines from real opens when ESP analytics are wired.",
      },
      {
        type: "p",
        text: "Subscribe at /newsletter. Prefer to ship product? Start free at /signup. Either way you are building owned attention, not renting someone else's feed.",
      },
    ],
  },
  {
    title: "How cold-start founders get found",
    slug: "how-cold-start-founders-get-found",
    date: "2026-07-16",
    tag: "archive",
    author: DOGFOOD_OPERATOR.name,
    listed: false,
    excerpt:
      "Archive: distribution gravity notes from the sourcing experiment. Company product remains the marketing loop.",
    body: [],
    blocks: [
      {
        type: "p",
        text: "Cold-start founders have no Crunchbase page, thin LinkedIn, and a GitHub that does not scream pedigree. Traditional VC tooling over-indexes on track record and quietly re-creates network bias.",
      },
      {
        type: "p",
        text: "We score distribution gravity instead: earned attention velocity relative to follower base, narrative coherence across platforms, audience-pull versus push, and builder-in-public cadence. Punches-above-weight beats absolute size.",
      },
      {
        type: "mermaid",
        title: "Mermaid · gravity into Founder Score",
        caption:
          "*Track record is optional. In cold-start mode its weight redistributes — labeled in the UI, never silently zeroed against first-timers.",
        code: GRAVITY_FLOW,
      },
      {
        type: "mermaid",
        title: "Mermaid · Memory never forgets",
        caption:
          "Founder Score is a ledger. Opportunity scores (3 axes) are per company. Claims feed Trust into the memo.",
        code: MEMORY_GRAPH,
      },
      {
        type: "layers",
        title: "What gravity looks at",
        layers: [
          {
            name: "Velocity / size",
            detail: "Earned attention relative to follower base — not raw vanity counts.",
            accent: true,
          },
          {
            name: "Coherence",
            detail: "Same narrative across GH, HN, posts — not a new persona every week.",
          },
          {
            name: "Cadence",
            detail: "Builder-in-public rhythm the market can underwrite.",
          },
        ],
      },
      {
        type: "callout",
        tone: "warn",
        text: "When track record is missing, weight redistributes into gravity / cadence / coherence — we do not punish first-timers with a zero. That is cold-start mode, labeled in the UI.",
      },
      {
        type: "callout",
        tone: "muted",
        text: "Archive: this note belongs to an experimental sourcing path. For the product we sell, open /get-started — marketing loop, not investor tooling.",
      },
    ],
  },
  {
    title: "What agentic marketing actually means",
    slug: "what-agentic-marketing-actually-means",
    date: "2026-07-14",
    tag: "product",
    author: DOGFOOD_OPERATOR.name,
    excerpt:
      "Not another copywriter. Not a calendar. A fleet that senses, decides, acts, and learns — with a human on the dial.",
    body: [],
    blocks: [
      {
        type: "p",
        text: "Most AI marketing tools generate text. That is useful and incomplete. Agentic marketing means a system that can run a multi-step loop: sense public surfaces, decide what matters for your ICP, act across channels, and learn what worked into persistent brand memory.",
      },
      {
        type: "mermaid",
        title: "Mermaid · operating loop",
        caption:
          "GATE is not optional theater — autonomy L1–L3 decides how far ACT can go before a human.",
        code: FLEET_LOOP,
      },
      {
        type: "pipeline",
        title: "Pipeline · autonomy dial",
        caption: "Same fleet. Different permission to leave the queue.",
        steps: [
          { label: "L1", detail: "Draft only" },
          { label: "L2", detail: "Approve to publish" },
          { label: "L3", detail: "Supervised engage" },
        ],
      },
      {
        type: "layers",
        title: "Fleet roles",
        layers: [
          {
            name: "Strategist",
            detail: "Goals, calendar, channel mix from brand memory.",
          },
          {
            name: "Content",
            detail: "Drafts posts and threads in your voice.",
            accent: true,
          },
          {
            name: "Distributor",
            detail: "Publishes and engages within rate limits — after HITL.",
          },
          {
            name: "Analyst",
            detail: "Feeds LEARN so context never resets every session.",
          },
        ],
      },
      {
        type: "p",
        text: "Autonomy without control is brand risk. That is why the HITL dial matters — draft-only, approve-to-publish, or supervised engage. Human-in-the-loop is a product feature, not an apology for incomplete automation.",
      },
      {
        type: "p",
        text: "The connectors matter as much as the model. Founder channels — Reddit, Hacker News, X, LinkedIn — are where early customers live. A fleet that cannot operate there is a writing assistant with a fancy label.",
      },
    ],
  },
  {
    title: "Distribution is the new scarcity",
    slug: "distribution-is-the-new-scarcity",
    date: "2026-07-12",
    tag: "thesis",
    author: DOGFOOD_OPERATOR.name,
    excerpt:
      "AI collapsed the cost of building. Attention did not get cheaper — so the bottleneck moved.",
    body: [],
    blocks: [
      {
        type: "p",
        text: "A decade ago, shipping a SaaS product took a team and a runway. Today a solo founder can vibe-code a working MVP in a weekend. The hard part is no longer the build — it is getting strangers to care.",
      },
      {
        type: "layers",
        title: "Where the bottleneck moved",
        layers: [
          {
            name: "Build cost",
            detail: "Collapsed — models, templates, and weekend MVPs.",
          },
          {
            name: "Attention cost",
            detail: "Did not — feeds are louder, trust is thinner.",
            accent: true,
          },
          {
            name: "Operating system",
            detail: "Missing — most founders still treat distribution as a side quest.",
          },
        ],
      },
      {
        type: "p",
        text: "When everyone can ship, distribution becomes the scarce resource. Followers, SEO, Product Hunt timing, Reddit credibility, and earned replies on X are not nice-to-haves. They are the difference between a dead repo and a real business.",
      },
      {
        type: "mermaid",
        title: "Mermaid · marketing loop",
        caption:
          "vibemarketer manufactures attention with brand memory and HITL — not autopilot spam.",
        code: ENGINE_MARKETING,
      },
      {
        type: "pipeline",
        title: "Pipeline · from URL to habit",
        steps: [
          { label: "URL", detail: "Product context" },
          { label: "Memory", detail: "Brand voice" },
          { label: "Draft", detail: "Multi-channel" },
          { label: "Gate", detail: "HITL" },
          { label: "Publish", detail: "Real only" },
        ],
      },
      {
        type: "p",
        text: "That is why we built vibemarketer as a marketing OS: strategy, creation, distribution, and learning in one loop with memory that does not reset every session. Schedulers alone move posts. We own the loop with you in the gate.",
      },
      {
        type: "p",
        text: "If you are a technical founder who can build but cannot market, the gap is not motivation — it is operating system. Treat distribution like infrastructure, not a side quest.",
      },
    ],
  },
];

// Keep body[] filled for RSS when only blocks were authored
for (const post of posts) {
  if (post.blocks?.length && post.body.length === 0) {
    post.body = blocksToBody(post.blocks);
  }
}

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return posts.map((p) => p.slug);
}

export function postsSorted(opts?: { includeUnlisted?: boolean }): Post[] {
  const list = opts?.includeUnlisted
    ? posts
    : posts.filter((p) => p.listed !== false);
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
}
