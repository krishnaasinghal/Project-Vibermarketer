import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { JsonLd } from "@/components/JsonLd";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import { WaitlistForm } from "@/components/WaitlistForm";
import { postsSorted } from "@/content/posts";
import { breadcrumbJsonLd, itemListJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";
import { NewsletterOk } from "./NewsletterOk";

export const metadata: Metadata = pageMetadata({
  title: "Newsletter",
  path: "/newsletter",
  description:
    "Distribution notes for builders — agentic marketing, gravity scoring, and launch loops. From vibemarketer.",
});

export default function NewsletterPage() {
  const latest = postsSorted().slice(0, 3);

  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            name: "vibemarketer newsletter",
            path: "/newsletter",
            description:
              "Distribution notes on agentic marketing, cold-start gravity, SEO/AEO, launch loops, and founder-led SaaS marketing.",
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Newsletter", path: "/newsletter" },
          ]),
          itemListJsonLd({
            name: "latest vibemarketer writing",
            path: "/newsletter",
            items: latest.map((post) => ({
              name: post.title,
              path: `/blog/${post.slug}`,
              description: post.excerpt,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow
        label="Owned audience"
        title="Distribution notes"
        lead="Short, technical letters on agentic marketing, cold-start gravity, and shipping without a marketer. Written the way the fleet drafts — then edited by a human."
      >
        <NewsletterOk />
      </MarketingPageHero>

      <MarketingSection>
        <div className="panel max-w-2xl border-accent/30 p-6 sm:p-8">
          <p className="section-label mb-2">Subscribe</p>
          <h2 className="font-display text-2xl font-semibold">
            One email when it matters
          </h2>
          <p className="mt-2 text-sm text-muted">
            No daily spam. Launch notes, playbooks, and product drops —
            unsubscribe anytime.
          </p>
          <WaitlistForm source="newsletter" showName cta="Subscribe" />
        </div>
      </MarketingSection>

      <MarketingSection flush>
        <MarketingSectionHeading label="From the blog" title="Latest writing" />
        <ul className="stagger space-y-0">
          {latest.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="group focus-ring block border-t border-line py-6"
              >
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {p.date}
                  {p.tag ? ` · ${p.tag}` : ""}
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold group-hover:text-accent">
                  {p.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{p.excerpt}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link href="/blog" className="text-accent hover:underline">
            All writing →
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
      </MarketingSection>
    </>
  );
}
