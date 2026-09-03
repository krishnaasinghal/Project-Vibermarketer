export type Guide = {
  title: string;
  slug: string;
  excerpt: string;
  bullets: string[];
};

export const guides: Guide[] = [
  {
    title: "Reddit for SaaS founders",
    slug: "reddit-for-saas",
    excerpt:
      "Earn trust in communities without looking like a bot with a launch link.",
    bullets: [
      "Map 3–5 subreddits where your ICP already complains about the problem",
      "Lead with help and receipts — demos, numbers, failure stories — before any CTA",
      "Use HITL approve-to-publish until the brand voice is stable in that community",
    ],
  },
  {
    title: "Launch without a marketer",
    slug: "launch-without-a-marketer",
    excerpt:
      "A weekend launch stack for builders who ship product and freeze on distribution.",
    bullets: [
      "Pick one wedge channel and one proof artifact (demo video, PH, HN Show)",
      "Write the narrative once — reuse across PH, X, Reddit, and email",
      "Instrument week-one learning: what earned replies vs. what died silently",
    ],
  },
  {
    title: "The HITL autonomy dial",
    slug: "hitl-autonomy-dial",
    excerpt:
      "How far should agents go before a human signs off — and when to widen the gate.",
    bullets: [
      "Start draft-only on brand-sensitive channels; widen after quality evals pass",
      "Keep GATE always available — autonomy is a dial, not a one-way switch",
      "Escalate contradictions and ToS-risk actions to human review by default",
    ],
  },
];
