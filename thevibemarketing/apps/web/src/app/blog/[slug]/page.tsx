import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogBlocks } from "@/components/BlogBlocks";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import { JsonLd } from "@/components/JsonLd";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { WaitlistForm } from "@/components/WaitlistForm";
import { DOGFOOD_OPERATOR } from "@/content/dogfood-operator";
import {
  getAllSlugs,
  getPost,
  postHasDiagram,
  postsSorted,
} from "@/content/posts";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  itemListJsonLd,
  pageMetadata,
  webPageJsonLd,
} from "@/lib/seo";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Blog" };
  return pageMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.date,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = postsSorted()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);
  const hasDiagram = postHasDiagram(post);
  const isArchive = post.listed === false || post.tag === "archive";

  return (
    <article>
      <JsonLd
        data={[
          articleJsonLd({
            title: post.title,
            description: post.excerpt,
            path: `/blog/${post.slug}`,
            date: post.date,
          }),
          webPageJsonLd({
            name: post.title,
            description: post.excerpt,
            path: `/blog/${post.slug}`,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
          itemListJsonLd({
            name: "Related vibemarketer posts",
            path: `/blog/${post.slug}`,
            items: others.map((p) => ({
              name: p.title,
              path: `/blog/${p.slug}`,
              description: p.excerpt,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow={!hasDiagram}
        label={isArchive ? "Archive" : "Writing"}
        title={post.title}
        lead={post.excerpt}
      >
        {/* Meta row: large hit targets — chips are labels, not tiny links */}
        <div className="mt-2 flex flex-col gap-4">
          <Link
            href="/blog"
            className="btn-ghost focus-ring inline-flex min-h-11 w-fit items-center gap-2 !px-4 !py-2.5 text-sm"
          >
            <span aria-hidden>←</span> All posts
          </Link>

          <div className="flex flex-wrap gap-2">
            <time
              dateTime={post.date}
              className="inline-flex min-h-10 items-center rounded-md border border-line bg-bg-elevated px-3 py-2 font-mono text-xs text-muted"
            >
              {post.date}
            </time>
            {post.tag ? (
              <span className="inline-flex min-h-10 items-center rounded-md border border-line bg-bg-elevated px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted">
                {post.tag}
              </span>
            ) : null}
            {hasDiagram ? (
              <span className="inline-flex min-h-10 items-center rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-xs uppercase tracking-wider text-accent">
                diagrams
              </span>
            ) : null}
            {isArchive ? (
              <span className="inline-flex min-h-10 items-center rounded-md border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-xs uppercase tracking-wider text-warn">
                historical
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>By {post.author ?? DOGFOOD_OPERATOR.name}</span>
            <a
              href={DOGFOOD_OPERATOR.x_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost focus-ring inline-flex min-h-11 items-center !px-3 !py-2 text-sm text-accent"
            >
              @{DOGFOOD_OPERATOR.x_handle}
              <span className="sr-only"> on X (opens in new tab)</span>
            </a>
          </div>
        </div>
      </MarketingPageHero>

      <MarketingSection>
        <div className={hasDiagram ? "max-w-4xl" : "max-w-3xl"}>
          <BlogBlocks
            blocks={
              post.blocks ??
              post.body.map((text) => ({ type: "p" as const, text }))
            }
          />
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="panel max-w-2xl border-accent/30 p-6">
          <p className="section-label mb-2">Subscribe</p>
          <h2 className="font-display text-xl font-semibold">
            More like this, less feed noise
          </h2>
          <p className="mt-2 text-sm text-muted">
            Newsletter for builders — or start free in the app.
          </p>
          <WaitlistForm source="blog" compact cta="Subscribe" />
          <div className="cta-box mt-4">
            <p className="cta-box__hint">Continue</p>
            <div className="cta-box__actions">
              <AuthAwareActions
                guest={{
                  href: "/get-started",
                  label: "Get started",
                  className: "btn-primary focus-ring !px-4 !py-2.5 text-sm",
                }}
                authed={{
                  href: "/app/cmo",
                  label: "CMO desk",
                  className: "btn-primary focus-ring !px-4 !py-2.5 text-sm",
                }}
                guestSecondary={[
                  {
                    href: "/app/cmo",
                    label: "CMO desk",
                    className: "btn-ghost focus-ring !px-4 !py-2.5 text-sm",
                  },
                ]}
                authedSecondary={[
                  {
                    href: "/app/onboarding",
                    label: "Brand onboarding",
                    className: "btn-ghost focus-ring !px-4 !py-2.5 text-sm",
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </MarketingSection>

      {others.length > 0 ? (
        <MarketingSection flush>
          <MarketingSectionHeading label="Keep reading" title="More notes" />
          <ul className="stagger space-y-0">
            {others.map((p) => (
              <li key={p.slug} className="border-t border-line">
                <Link
                  href={`/blog/${p.slug}`}
                  className="group focus-ring block py-5"
                >
                  <h3 className="font-display text-lg font-semibold text-ink group-hover:text-accent">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{p.excerpt}</p>
                  {postHasDiagram(p) ? (
                    <span className="mt-2 inline-flex min-h-9 items-center rounded-md border border-accent/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">
                      diagrams
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </MarketingSection>
      ) : null}
    </article>
  );
}
