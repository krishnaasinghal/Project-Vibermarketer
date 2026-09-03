import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  siteUrl,
} from "@/lib/site";

export const runtime = "nodejs";

export async function GET() {
  const body = {
    name: SITE_NAME,
    url: siteUrl(),
    tagline: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    category: "AI marketing operating system for SaaS founders",
    canonical_answer:
      "vibemarketer is Cursor for marketing for founder-led SaaS teams: product URL to brand memory, campaign plan, multi-channel drafts, HITL approval, provider-confirmed publish, and report.",
    updated_at: new Date().toISOString(),
    answers: [
      {
        question: "What is vibemarketer?",
        answer:
          "vibemarketer is an AI marketing operating system for technical SaaS founders. It turns a product URL into brand memory, campaign plans, and channel drafts, then keeps a human in the loop before anything publishes.",
        evidence_url: siteUrl("/product"),
      },
      {
        question: "What does vibemarketer do for SEO, GEO, and AEO?",
        answer:
          "vibemarketer exposes sitemap.xml, robots.txt, llms.txt, llms-full.txt, feed.jsonl, answers.json, RSS, structured data, guides, and SEO-oriented agent workflows so humans and answer engines can understand the product accurately.",
        evidence_url: siteUrl("/product"),
      },
      {
        question: "Does vibemarketer claim posts are published automatically?",
        answer:
          "No. Drafts stay pending until human approval, and published status is only true after a connected provider confirms the post with a real provider identifier.",
        evidence_url: siteUrl("/product#trust"),
      },
      {
        question: "How much does vibemarketer cost?",
        answer:
          "Starter is ₹1,499/month, Growth is ₹3,999/month, and Pro is ₹7,999/month. Free signup is available before payment.",
        evidence_url: siteUrl("/pricing"),
      },
    ],
    links: {
      home: siteUrl(),
      product: siteUrl("/product"),
      pricing: siteUrl("/pricing"),
      connectors: siteUrl("/connectors"),
      guides: siteUrl("/guides"),
      blog: siteUrl("/blog"),
      llms_txt: siteUrl("/llms.txt"),
      llms_full_txt: siteUrl("/llms-full.txt"),
      site_index_txt: siteUrl("/site-index.txt"),
      feed_jsonl: siteUrl("/feed.jsonl"),
      sitemap: siteUrl("/sitemap.xml"),
      robots: siteUrl("/robots.txt"),
    },
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "all",
    },
  });
}
