import { GET as answersGet } from "@/app/answers.json/route";
import { GET as feedGet } from "@/app/feed.jsonl/route";
import robots from "@/app/robots";
import { GET as rssGet } from "@/app/rss.xml/route";
import { GET as siteIndexGet } from "@/app/site-index.txt/route";
import sitemap from "@/app/sitemap";
import { PUBLIC_ROUTES, siteUrl } from "@/lib/site";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function main() {
  const sitemapEntries = sitemap();
  const sitemapUrls = sitemapEntries.map((entry) => entry.url);

  assert(
    PUBLIC_ROUTES.every((route) =>
      sitemapUrls.includes(siteUrl(route.path === "/" ? "" : route.path)),
    ),
    "sitemap must include every public marketing route",
  );
  assert(
    sitemapUrls.includes(siteUrl("/answers.json")),
    "sitemap must expose answers.json",
  );
  assert(
    sitemapUrls.includes(siteUrl("/site-index.txt")),
    "sitemap must expose site-index.txt",
  );
  assert(
    !sitemapUrls.some((url) =>
      ["/app/", "/api/", "/login", "/signup", "/checkout/success"].some(
        (path) => url.includes(path),
      ),
    ),
    "sitemap must not expose private/auth/checkout routes",
  );
  assert(
    new Set(sitemapUrls).size === sitemapUrls.length,
    "sitemap URLs must be unique",
  );

  const robotsRules = asArray(robots().rules);
  const disallowText = robotsRules
    .flatMap((rule) => asArray(rule.disallow))
    .join(" ");
  const allowText = robotsRules.flatMap((rule) => asArray(rule.allow)).join(" ");
  assert(disallowText.includes("/app/"), "robots must disallow app routes");
  assert(disallowText.includes("/api/"), "robots must disallow API routes");
  assert(disallowText.includes("/login"), "robots must disallow login route");
  assert(allowText.includes("/answers.json"), "robots must allow answers.json");
  assert(allowText.includes("/site-index.txt"), "robots must allow site-index.txt");

  const feedText = await (await feedGet()).text();
  const feedRows = feedText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert(feedRows.length > PUBLIC_ROUTES.length, "feed.jsonl must include pages and answer facts");
  assert(
    feedRows.some((row) => row.type === "answer" && row.topic === "what is vibemarketer"),
    "feed.jsonl must include canonical answer rows",
  );
  assert(
    feedText.includes(siteUrl("/answers.json")) && feedText.includes(siteUrl("/site-index.txt")),
    "feed.jsonl must link answer and site-index assets",
  );

  const answers = (await (await answersGet()).json()) as {
    canonical_answer?: string;
    answers?: unknown[];
    links?: Record<string, string>;
  };
  assert(
    answers.canonical_answer?.includes("Cursor for marketing"),
    "answers.json must include canonical positioning",
  );
  assert((answers.answers?.length ?? 0) >= 4, "answers.json must include answer records");
  assert(
    answers.links?.site_index_txt === siteUrl("/site-index.txt"),
    "answers.json must link site-index.txt",
  );

  const siteIndex = await (await siteIndexGet()).text();
  assert(siteIndex.includes("Public pages"), "site-index.txt must include public pages");
  assert(siteIndex.includes(siteUrl("/answers.json")), "site-index.txt must link answers.json");
  assert(siteIndex.includes(siteUrl("/guides")), "site-index.txt must include guides");

  const rss = await (await rssGet()).text();
  assert(rss.includes("<lastBuildDate>"), "rss.xml must include lastBuildDate");
  assert(rss.includes("application/x-ndjson"), "rss.xml must link feed.jsonl");
  assert(rss.includes("<category>AEO</category>"), "rss.xml must include AEO category");

  console.log("seo-assets.test: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
