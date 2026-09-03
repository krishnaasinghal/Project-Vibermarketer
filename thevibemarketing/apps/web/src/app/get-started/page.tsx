import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { getAuthUser } from "@/lib/auth";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingStepList,
} from "@/components/MarketingPage";
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  marketingLoopHowToJsonLd,
  pageMetadata,
  webPageJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Get started",
  path: "/get-started",
  description:
    "Start vibemarketer in minutes: account → brand URL → CMO desk → Studio agents → HITL queue.",
});
export const dynamic = "force-dynamic";

const signedOutSteps = [
  {
    n: "01",
    title: "Create your account",
    detail:
      "Sign up so brand memory, drafts, and queue state persist across sessions.",
    href: "/signup",
    cta: "Sign up",
  }, {
    n: "02",
    title: "Paste your product URL",
    detail:
      "Onboarding extracts ICP, tone, pillars, and a short product description — then runs a GEO / site health scorecard.",
    href: "/app/onboarding",
    cta: "Open onboarding",
  },
  {
    n: "03",
    title: "Open the CMO desk",
    detail:
      "Your daily plan, agents feed, site scores, competitors, and CMO chat — one place to run growth.",
    href: "/app/cmo",
    cta: "Open CMO desk",
  },
  {
    n: "04",
    title: "Run agents in Studio",
    detail:
      "Reddit opportunities, HN comments, SEO long-form, or three channel drafts. Everything lands in HITL first.",
    href: "/app/studio",
    cta: "Open Studio",
  },
  {
    n: "05",
    title: "Approve in the queue",
    detail:
      "Edit voice, approve to queue, or reject with a note. We never mark published without a real provider post ID.",
    href: "/app/queue",
    cta: "Open queue",
  },
  {
    n: "06",
    title: "Connect channels when ready",
    detail:
      "OAuth for X, LinkedIn, Reddit via Composio. Publishing stays approval-gated.",
    href: "/app/connectors",
    cta: "Connectors",
  },
] as const;

const signedInSteps = [
  {
    n: "01",
    title: "Open your app",
    detail:
      "You are already signed in. Jump to the CMO desk and continue your setup.",
    href: "/app/cmo",
    cta: "Open app",
  },
  ...signedOutSteps.slice(1),
] as const;

export default async function GetStartedPage() {
  const user = await getAuthUser();
  const steps = user ? signedInSteps : signedOutSteps;
  const primaryActionHref = user ? "/app/cmo" : "/signup";
  const primaryActionLabel = user ? "1 · Open app" : "1 · Create account";
  const quickSteps = user
    ? ["Open app", "Paste product URL (onboarding)", "Open CMO desk", "Approve one draft in the queue"]
    : [
        "Create account",
        "Paste product URL (onboarding)",
        "Open CMO desk → run an agent",
        "Approve one draft in the queue",
      ];

  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            name: "Get started with vibemarketer",
            path: "/get-started",
            description:
              "A short workflow for going from account creation to brand URL, CMO desk, Studio agents, HITL queue, and connected channels.",
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Get started", path: "/get-started" },
          ]),
          marketingLoopHowToJsonLd(),
          itemListJsonLd({
            name: "vibemarketer getting started steps",
            path: "/get-started",
            items: steps.map((step) => ({
              name: step.title,
              path: step.href,
              description: step.detail,
            })),
          }),
        ]}
      />
      <MarketingPageHero
        narrow
        label="Start here"
        title="From URL to demand in one loop"
        lead={
          <>
            Brand memory → drafts → human approval. One product path for SaaS
            founders — no autopilot spam, no fake published posts.
          </>
        }
        actionsHint="Step 1 only — then follow the list below"
        actions={
          <>
            <Link href={primaryActionHref} className="btn-primary focus-ring text-base">
              {primaryActionLabel}
            </Link>
            <Link href="/pricing" className="btn-ghost focus-ring text-base">
              See pricing
            </Link>
          </>
        }
      >
        <div className="panel border-accent/30 p-5">
          <p className="section-label mb-1 text-accent">10-minute path</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            {quickSteps.map((quickStep) => (
              <li key={quickStep}>{quickStep}</li>
            ))}
          </ol>
        </div>
      </MarketingPageHero>

      <MarketingSection flush>
        <MarketingStepList steps={steps} />
        <p className="mt-8 max-w-xl text-sm text-muted">
          Stuck?{" "}
          <Link href="/demo" className="text-accent hover:underline">
            See the product tour
          </Link>{" "}
          or{" "}
          <Link href="/pricing" className="text-accent hover:underline">
            pricing
          </Link>
          .
        </p>
      </MarketingSection>
    </>
  );
}
