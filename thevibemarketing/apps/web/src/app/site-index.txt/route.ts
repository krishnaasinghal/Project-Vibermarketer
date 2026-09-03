import { guides } from "@/content/guides";
import { postsSorted } from "@/content/posts";
import {
  PUBLIC_ROUTES,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  siteUrl,
} from "@/lib/site";

export const runtime = "nodejs";

export async function GET() {
  const lines = [
    `${SITE_NAME} site index`,
    SITE_TAGLINE,
    SITE_DESCRIPTION,
    "",
    "Canonical",
    siteUrl(),
    "",
    "Public pages",
    ...PUBLIC_ROUTES.map((route) => `- ${siteUrl(route.path === "/" ? "" : route.path)}`),
    "",
    "Blog posts",
    ...postsSorted().map((post) => `- ${post.title}: ${siteUrl(`/blog/${post.slug}`)} — ${post.excerpt}`),
    "",
    "Guides",
    ...guides.map((guide) => `- ${guide.title}: ${siteUrl(`/guides/${guide.slug}`)} — ${guide.excerpt}`),
    "",
    "Machine-readable assets",
    `- llms.txt: ${siteUrl("/llms.txt")}`,
    `- llms-full.txt: ${siteUrl("/llms-full.txt")}`,
    `- feed.jsonl: ${siteUrl("/feed.jsonl")}`,
    `- answers.json: ${siteUrl("/answers.json")}`,
    `- rss.xml: ${siteUrl("/rss.xml")}`,
    `- sitemap.xml: ${siteUrl("/sitemap.xml")}`,
    `- robots.txt: ${siteUrl("/robots.txt")}`,
  ];

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "all",
    },
  });
}
