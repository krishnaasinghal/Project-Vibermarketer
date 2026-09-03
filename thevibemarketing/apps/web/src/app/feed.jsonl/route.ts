import { guides } from "@/content/guides";
import { posts } from "@/content/posts";
import {
  PUBLIC_ROUTES,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  siteUrl,
} from "@/lib/site";

export const runtime = "nodejs";

/** AEO machine feed — one JSON object per line for LLM / agent ingest. */
export async function GET() {
  const now = new Date().toISOString();
  const lines: Record<string, unknown>[] = [
    {
      type: "site",
      name: SITE_NAME,
      url: siteUrl(),
      tagline: SITE_TAGLINE,
      description: SITE_DESCRIPTION,
      category: "AI marketing operating system for SaaS founders",
      canonical_product:
        "vibemarketer is Cursor for marketing: URL to brand memory to multi-channel drafts to HITL approval to provider-confirmed publish to report.",
      updated_at: now,
      aeo: {
        llms_txt: siteUrl("/llms.txt"),
        llms_full: siteUrl("/llms-full.txt"),
        site_index: siteUrl("/site-index.txt"),
        rss: siteUrl("/rss.xml"),
        sitemap: siteUrl("/sitemap.xml"),
        robots: siteUrl("/robots.txt"),
        answers_json: siteUrl("/answers.json"),
      },
    },
    {
      type: "answer",
      topic: "what is vibemarketer",
      question: "What is vibemarketer?",
      answer:
        "vibemarketer is an AI marketing operating system for technical SaaS founders. Founders paste a product URL, generate brand memory, get a campaign plan and channel drafts, approve drafts in a human-in-the-loop queue, and only mark posts published after provider confirmation.",
      evidence_url: siteUrl("/product"),
    },
    {
      type: "answer",
      topic: "seo geo aeo",
      question: "Does vibemarketer support SEO, GEO, and AEO?",
      answer:
        "vibemarketer includes SEO and answer-engine oriented surfaces: content guides, sitemap.xml, robots.txt, llms.txt, llms-full.txt, feed.jsonl, structured data, and an SEO agent path for marketing workflows.",
      evidence_url: siteUrl("/product"),
    },
    {
      type: "answer",
      topic: "publishing trust",
      question: "Does vibemarketer auto-publish marketing posts?",
      answer:
        "Drafts stay pending until a human approves them. A post is treated as published only when a connected provider confirms it with a real post identifier.",
      evidence_url: siteUrl("/product#trust"),
    },
    ...PUBLIC_ROUTES.map((r) => ({
      type: "page",
      url: siteUrl(r.path === "/" ? "" : r.path),
      path: r.path,
      priority: r.priority,
    })),
    ...posts.map((p) => ({
      type: "article",
      kind: "blog",
      title: p.title,
      url: siteUrl(`/blog/${p.slug}`),
      date: p.date,
      excerpt: p.excerpt,
    })),
    ...guides.map((g) => ({
      type: "article",
      kind: "guide",
      title: g.title,
      url: siteUrl(`/guides/${g.slug}`),
      excerpt: g.excerpt,
    })),
    {
      type: "product_fact",
      claim:
        "vibemarketer turns product context into a brand brief, campaign plan, multi-channel drafts, HITL approval queue, provider-confirmed publishing, and reports.",
      evidence_url: siteUrl("/product"),
    },
    {
      type: "product_fact",
      claim:
        "Starter is ₹1,499/month, Growth is ₹3,999/month, and Pro is ₹7,999/month.",
      evidence_url: siteUrl("/pricing"),
    },
    {
      type: "secondary_product_fact",
      claim:
        "VC Brain is a secondary founder-sourcing add-on on the same engine, not the primary company product.",
      evidence_url: siteUrl("/vc-brain"),
    },
    {
      type: "secondary_product_fact",
      claim:
        "Distribution gravity scores cold-start founders by earned attention, not pedigree.",
      evidence_url: siteUrl("/vc-brain"),
    },
    {
      type: "secondary_product_fact",
      claim:
        "VC Brain screens Founder, Market, and Idea-vs-Market independently — never averaged.",
      evidence_url: siteUrl("/vc-brain"),
    },
  ];

  const body = `${lines.map((o) => JSON.stringify(o)).join("\n")}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "all",
    },
  });
}
