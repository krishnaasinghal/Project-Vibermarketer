import type { Metadata } from "next";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import { JsonLd } from "@/components/JsonLd";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingStepList,
} from "@/components/MarketingPage";
import { breadcrumbJsonLd, itemListJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Product tour",
  path: "/demo",
  description:
    "Walk vibemarketer in minutes: paste URL → brand memory → drafts → HITL queue.",
});

const BEATS = [
  {
    n: "01",
    title: "Paste product URL",
    detail:
      "Onboarding scrapes your site, builds brand memory, and starts first drafts when the model is live.",
    href: "/app/onboarding",
    cta: "Onboarding",
  },
  {
    n: "02",
    title: "CMO desk",
    detail:
      "Daily plan, agents feed, site health scores, competitors, and chat — marketing primary.",
    href: "/app/cmo",
    cta: "Open CMO desk",
  },
  {
    n: "03",
    title: "Run agents",
    detail:
      "Studio: Reddit, HN, SEO, or three channel drafts — all require a live model; nothing is faked.",
    href: "/app/studio",
    cta: "Studio",
  },
  {
    n: "04",
    title: "Approve before publish",
    detail:
      "Queue: edit, approve (queues for provider), or reject. Live post links only after a real provider ID.",
    href: "/app/queue",
    cta: "HITL queue",
  },
] as const;

export default function DemoTourPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            name: "vibemarketer product tour",
            path: "/demo",
            description:
              "A four-step tour of the vibemarketer marketing loop: paste URL, build brand memory, run agents, and approve before publish.",
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Product tour", path: "/demo" },
          ]),
          itemListJsonLd({
            name: "vibemarketer product tour steps",
            path: "/demo",
            items: BEATS.map((beat) => ({
              name: beat.title,
              path: beat.href,
              description: beat.detail,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow
        label="Product tour"
        title="See the marketing loop"
        lead={
          <>
            Four steps from brand URL to approval-gated drafts. Press{" "}
            <kbd className="border border-line px-1.5 py-0.5 font-mono text-xs text-accent">
              ⌘K
            </kbd>{" "}
            inside the app for shortcuts.
          </>
        }
        actionsHint="Tour starts at the CMO desk"
        actions={
          <>
            <AuthAwareActions
              guest={{
                href: "/app/cmo",
                label: "Start at CMO desk",
                className: "btn-primary focus-ring text-base",
              }}
              authed={{
                href: "/app/cmo",
                label: "Start at CMO desk",
                className: "btn-primary focus-ring text-base",
              }}
              guestSecondary={[
                {
                  href: "/get-started",
                  label: "Full checklist",
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
      />

      <MarketingSection flush>
        <MarketingStepList steps={BEATS} />
      </MarketingSection>
    </>
  );
}
