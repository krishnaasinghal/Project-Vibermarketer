import type { Metadata } from "next";
import Link from "next/link";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { JsonLd } from "@/components/JsonLd";
import { WaitlistForm } from "@/components/WaitlistForm";
import { postHasDiagram, postsSorted, type Post } from "@/content/posts";
import { breadcrumbJsonLd, itemListJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  path: "/blog",
  description:
    "Notes on agentic GTM, brand memory, HITL drafts, and shipping distribution for SaaS founders.",
});

function matchesSearch(post: Post, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    post.title,
    post.excerpt,
    post.tag ?? "",
    post.author ?? "",
    ...post.body,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQuery } = await searchParams;
  const query = rawQuery?.trim() ?? "";
  const posts = postsSorted().filter((post) => matchesSearch(post, query));

  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            type: "CollectionPage",
            name: "vibemarketer blog",
            path: "/blog",
            description:
              "Writing on agentic GTM, brand memory, HITL drafts, SEO/AEO, and founder-led SaaS distribution.",
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
          ]),
          itemListJsonLd({
            name: "vibemarketer blog posts",
            path: "/blog",
            items: posts.map((post) => ({
              name: post.title,
              path: `/blog/${post.slug}`,
              description: post.excerpt,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow
        label="Writing"
        title="Blog"
        lead="Agentic GTM, architecture, and build-in-public notes — dogfooded on vibemarketer itself."
        actions={
          <Link href="/newsletter" className="btn-ghost focus-ring text-base">
            Newsletter →
          </Link>
        }
      />

      <MarketingSection>
        <form
          action="/blog"
          role="search"
          className="mb-8 flex max-w-2xl flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="blog-search" className="sr-only">
            Search vibemarketer writing
          </label>
          <input
            id="blog-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search agentic GTM, SEO, HITL..."
            className="input-field min-h-12 flex-1"
          />
          <button type="submit" className="btn-primary focus-ring">
            Search
          </button>
        </form>
        {query && posts.length === 0 ? (
          <div className="panel mb-8 max-w-2xl p-5">
            <p className="text-sm text-muted">
              No posts found for <span className="text-ink">{query}</span>.
            </p>
            <Link href="/blog" className="mt-3 inline-flex text-sm text-accent hover:underline">
              Clear search
            </Link>
          </div>
        ) : null}
        <ul className="stagger space-y-0">
          {posts.map((p) => (
            <li key={p.slug} className="border-t border-line">
              <Link
                href={`/blog/${p.slug}`}
                className="group focus-ring block py-8"
              >
                <div className="flex flex-wrap gap-2">
                  <time
                    dateTime={p.date}
                    className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-muted"
                  >
                    {p.date}
                  </time>
                  {p.tag ? (
                    <span className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                      {p.tag}
                    </span>
                  ) : null}
                  {postHasDiagram(p) ? (
                    <span className="inline-flex min-h-9 items-center rounded-md border border-accent/40 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-accent">
                      diagrams
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight group-hover:text-accent sm:text-3xl">
                  {p.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                  {p.excerpt}
                </p>
                {p.author ? (
                  <p className="mt-3 text-sm text-muted">By {p.author}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection flush>
        <MarketingSectionHeading
          label="Newsletter"
          title="Get distribution notes in your inbox"
          lead="Same writing, less feed noise. Prefer to ship? Start free — product is live."
        />
          <div className="panel max-w-2xl border-accent/30 p-6">
            <WaitlistForm source="blog" cta="Subscribe from blog" compact />
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href="/newsletter" className="text-accent hover:underline">
                Newsletter page
              </Link>
              <AuthAwareActions
                guest={{
                  href: "/signup",
                  label: "Start free",
                  className: "text-accent hover:underline",
                }}
                authed={{
                  href: "/app/cmo",
                  label: "Open app",
                  className: "text-accent hover:underline",
                }}
              />
              <Link
                href="/tools/gravity-audit"
                className="text-accent hover:underline"
            >
              Gravity Audit
            </Link>
          </div>
        </div>
      </MarketingSection>
    </>
  );
}
