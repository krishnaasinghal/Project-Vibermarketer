import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import { JsonLd } from "@/components/JsonLd";
import {
  MarketingPageHero,
  MarketingSection,
} from "@/components/MarketingPage";
import { guides } from "@/content/guides";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  itemListJsonLd,
  pageMetadata,
  webPageJsonLd,
} from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = guides.find((x) => x.slug === slug);
  if (!g) return { title: "Guide" };
  return pageMetadata({
    title: g.title,
    description: g.excerpt,
    path: `/guides/${g.slug}`,
    type: "article",
  });
}

export default async function GuideSlugPage({ params }: Props) {
  const { slug } = await params;
  const g = guides.find((x) => x.slug === slug);
  if (!g) notFound();
  const otherGuides = guides.filter((guide) => guide.slug !== g.slug);

  return (
    <article>
      <JsonLd
        data={[
          articleJsonLd({
            title: g.title,
            description: g.excerpt,
            path: `/guides/${g.slug}`,
            date: "2026-07-18",
          }),
          webPageJsonLd({
            name: g.title,
            description: g.excerpt,
            path: `/guides/${g.slug}`,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: g.title, path: `/guides/${g.slug}` },
          ]),
          itemListJsonLd({
            name: "Related vibemarketer guides",
            path: `/guides/${g.slug}`,
            items: otherGuides.map((guide) => ({
              name: guide.title,
              path: `/guides/${guide.slug}`,
              description: guide.excerpt,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow
        label="Playbook"
        title={g.title}
        lead={g.excerpt}
        actions={
          <>
            <AuthAwareActions
              guest={{
                href: "/app/studio",
                label: "Open Studio",
                className: "btn-primary focus-ring text-base",
              }}
              authed={{
                href: "/app/studio",
                label: "Open Studio",
                className: "btn-primary focus-ring text-base",
              }}
              guestSecondary={[
                {
                  href: "/get-started",
                  label: "Get started",
                  className: "btn-ghost focus-ring text-base",
                },
              ]}
              authedSecondary={[
                {
                  href: "/get-started",
                  label: "See the steps",
                  className: "btn-ghost focus-ring text-base",
                },
              ]}
            />
          </>
        }
      >
        <Link
          href="/guides"
          className="text-sm text-accent hover:underline focus-ring"
        >
          ← Guides
        </Link>
      </MarketingPageHero>

      <MarketingSection flush>
        <ol className="stagger max-w-2xl list-decimal space-y-5 pl-5 text-muted">
          {g.bullets.map((b) => (
            <li key={b} className="pl-1">
              <span className="text-base leading-relaxed text-ink">{b}</span>
            </li>
          ))}
        </ol>
      </MarketingSection>
    </article>
  );
}
