import type { MetadataRoute } from "next";
import { guides } from "@/content/guides";
import { posts } from "@/content/posts";
import { PUBLIC_ROUTES, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((r) => ({
    url: siteUrl(r.path === "/" ? "" : r.path),
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: siteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.date),
    changeFrequency: "monthly",
    priority: 0.65,
  }));

  const guideEntries: MetadataRoute.Sitemap = guides.map((g) => ({
    url: siteUrl(`/guides/${g.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const aeoEntries: MetadataRoute.Sitemap = [
    "/llms.txt",
    "/llms-full.txt",
    "/site-index.txt",
    "/feed.jsonl",
    "/answers.json",
    "/rss.xml",
    "/humans.txt",
  ].map((path) => ({
    url: siteUrl(path),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.3,
  }));

  return [...staticEntries, ...blogEntries, ...guideEntries, ...aeoEntries];
}
