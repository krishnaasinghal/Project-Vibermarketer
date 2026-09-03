import type { Metadata } from "next";
import Link from "next/link";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { JsonLd } from "@/components/JsonLd";
import { guides } from "@/content/guides";
import { breadcrumbJsonLd, itemListJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Guides",
  path: "/guides",
  description:
    "Playbooks for Reddit SaaS marketing, launches without a marketer, and HITL autonomy.",
});

const quick = [
  {
    href: "/get-started",
    title: "Get started",
    blurb: "Onboarding → brand memory → Studio → HITL queue.",
  },
  {
    href: "/demo",
    title: "Product tour",
    blurb: "Four steps from URL to approved draft.",
  },
  {
    href: "/app/onboarding",
    title: "Brand onboarding",
    blurb: "URL → brand memory through live Firecrawl extraction and model-backed facts.",
  },
  {
    href: "/app/studio",
    title: "Studio + HITL",
    blurb: "Draft posts, queue for approval, keep high-risk actions gated.",
  },
] as const;

export default function GuidesPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            type: "CollectionPage",
            name: "vibemarketer guides",
            path: "/guides",
            description:
              "Practical vibemarketer playbooks for Reddit SaaS marketing, launches without a marketer, and HITL autonomy.",
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
          ]),
          itemListJsonLd({
            name: "vibemarketer playbooks",
            path: "/guides",
            items: guides.map((guide) => ({
              name: guide.title,
              path: `/guides/${guide.slug}`,
              description: guide.excerpt,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow
        label="Docs"
        title="Guides"
        lead="Practical paths through vibemarketer — brand memory, drafts, and HITL."
        actions={
          <AuthAwareActions
            guest={{
              href: "/get-started",
              label: "Get started",
              className: "btn-primary focus-ring text-base",
            }}
            authed={{
              href: "/app/cmo",
              label: "Open app",
              className: "btn-primary focus-ring text-base",
            }}
          />
        }
      />

      <MarketingSection>
        <MarketingSectionHeading label="Shortcuts" title="Quick links" />
        <ul className="stagger grid gap-3 sm:grid-cols-2">
          {quick.map((g) => (
            <li key={g.href}>
              <Link
                href={g.href}
                className="panel focus-ring block h-full p-5 transition-colors hover:border-accent/40"
              >
                <p className="font-display text-lg font-semibold">{g.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {g.blurb}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection flush>
        <MarketingSectionHeading label="Deep dives" title="Playbooks" />
        <ul className="stagger space-y-3">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="panel focus-ring block p-5 transition-colors hover:border-accent/40 sm:p-6"
              >
                <h3 className="font-display text-lg font-semibold sm:text-xl">
                  {g.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {g.excerpt}
                </p>
                <p className="mt-3 text-sm text-accent">Read playbook →</p>
              </Link>
            </li>
          ))}
        </ul>
      </MarketingSection>
    </>
  );
}
