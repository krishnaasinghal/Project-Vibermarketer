import { posts } from "@/content/posts";
import { SITE_DESCRIPTION, SITE_EMAIL, SITE_NAME, siteUrl } from "@/lib/site";

export const runtime = "nodejs";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const sortedPosts = posts.slice().sort((a, b) => b.date.localeCompare(a.date));
  const lastBuildDate = sortedPosts[0]?.date
    ? new Date(sortedPosts[0].date).toUTCString()
    : new Date().toUTCString();
  const items = posts
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => {
      const link = siteUrl(`/blog/${p.slug}`);
      const bodyPreview = p.body.slice(0, 2).join("\n\n") || p.excerpt;
      const description = `${p.excerpt}\n\n${bodyPreview}`;
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      ${p.author ? `<author>${escapeXml(`${SITE_EMAIL} (${p.author})`)}</author>` : ""}
      ${p.tag ? `<category>${escapeXml(p.tag)}</category>` : ""}
      <category>vibemarketer</category>
      <category>agentic marketing</category>
      <description>${escapeXml(description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${siteUrl()}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <managingEditor>${escapeXml(SITE_EMAIL)}</managingEditor>
    <webMaster>${escapeXml(SITE_EMAIL)}</webMaster>
    <category>AI marketing</category>
    <category>SEO</category>
    <category>AEO</category>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <atom:link href="${siteUrl("/rss.xml")}" rel="self" type="application/rss+xml"/>
    <atom:link href="${siteUrl("/feed.jsonl")}" rel="alternate" type="application/x-ndjson"/>
    <atom:link href="${siteUrl("/answers.json")}" rel="alternate" type="application/json"/>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
