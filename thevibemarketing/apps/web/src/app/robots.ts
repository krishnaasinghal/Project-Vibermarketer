import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** SEO crawlers + major AI/AEO bots — public pages open, app/api closed. */
export default function robots(): MetadataRoute.Robots {
  const allowPublic = [
    "/",
    "/product",
    "/connectors",
    "/pricing",
    "/vc-brain",
    "/blog",
    "/guides",
    "/tools/",
    "/get-started",
    "/demo",
    "/newsletter",
    "/llms.txt",
    "/llms-full.txt",
    "/site-index.txt",
    "/feed.jsonl",
    "/answers.json",
    "/rss.xml",
    "/humans.txt",
    "/brand/",
  ];
  const disallowPrivate = [
    "/app/",
    "/api/",
    "/login",
    "/signup",
    "/checkout/",
    "/auth/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      // Explicit AEO crawler allow-list (same public surface)
      {
        userAgent: "GPTBot",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      {
        userAgent: "ChatGPT-User",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      {
        userAgent: "Google-Extended",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      {
        userAgent: "PerplexityBot",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      {
        userAgent: "ClaudeBot",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      {
        userAgent: "anthropic-ai",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
      {
        userAgent: "Applebot-Extended",
        allow: allowPublic,
        disallow: disallowPrivate,
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
    host: siteUrl().replace(/^https?:\/\//, ""),
  };
}
