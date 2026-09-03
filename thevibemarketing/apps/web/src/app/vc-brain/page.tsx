import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { VcBrainTeaser } from "@/components/VcBrainTeaser";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "VC Brain",
  path: "/vc-brain",
  description:
    "Distribution-native founder sourcing — Identify, 3-axis Screening, Diligence Trust Scores, $100K decision-support in 24 hours.",
  keywords: [
    "VC Brain",
    "founder sourcing",
    "distribution gravity",
    "investment memo AI",
    "Founder Score",
  ],
});

const FLOW = [
  {
    t: "Sourcing",
    d: "Identify live: GitHub · Hacker News · arXiv. Hackathons / Product Hunt / accelerators: coming soon (never fabricated). Activate → Converge into one funnel with inbound.",
  },
  {
    t: "Screening",
    d: "First-pass gate · 3 axes never averaged (Founder / Market / Idea-vs-Market) · thesis lens · persistent Founder Score with cold-start mode.",
  },
  {
    t: "Diligence",
    d: "Per-claim Trust Score · contradiction flags · URL verify when evidence links exist · validator before the memo.",
  },
  {
    t: "Decision",
    d: "Evidence memo + gaps + $100K yes/no/watch (decision-support, not an investment offer) · full agent traces.",
  },
] as const;

const JUDGE_RUNBOOK = [
  {
    step: "1) Trigger",
    text: "Click Run judge flow so radar performs identify → top candidate selection → auto screen.",
  },
  {
    step: "2) Validate",
    text: "Each run validates required providers (OPENAI, GitHub, Tavily, Firecrawl) before opening a candidate.",
  },
  {
    step: "3) Open memo",
    text: "When screening finishes, the flow lands on memo for the founder so judges can review decision-support immediately.",
  },
] as const;

export default function VcBrainPage() {
  return (
    <>
      <MarketingPageHero
        label="Optional · same engine"
        title="VC Brain"
        lead={
          <>
            Founder-sourcing add-on: score builders by{" "}
            <span className="text-ink">distribution gravity</span>, not pedigree.
            Evidence memo for a $100K decision-support check — not an investment
            offer. Main product is the marketing fleet.
          </>
        }
        actionsHint="If you want founder radar"
        actions={
          <>
            <Link href="/app/radar" className="btn-primary focus-ring text-base">
              Open founder radar
            </Link>
            <Link
              href="/login?next=%2Fapp%2Fradar%3Fauto%3D1%26open_memo%3D1"
              className="btn-ghost focus-ring text-base"
            >
              Run judge flow
            </Link>
            <Link href="/" className="btn-ghost focus-ring text-base">
              Back to marketing product
            </Link>
          </>
        }
        aside={<VcBrainTeaser />}
      />

      <MarketingSection>
        <MarketingSectionHeading
          label="Pipeline"
          title="Four stages, one funnel"
          lead="Live sources only. Axes stay separate. Trust surfaces contradictions before the memo."
        />
        <div className="stagger grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((x) => (
            <div key={x.t} className="border-t border-accent/40 pt-5">
              <h2 className="font-display text-xl font-semibold text-accent">
                {x.t}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionHeading label="How to start" title="Three clicks to signal" />
        <ol className="max-w-2xl list-decimal space-y-3 pl-5 text-base text-muted">
          <li>
            <Link href="/app/radar" className="text-accent hover:underline">
              Open radar
            </Link>{" "}
            — Identify · refresh for live GitHub + HN + arXiv signals
          </li>
          <li>
            <Link href="/app/compare" className="text-accent hover:underline">
              Gravity compare
            </Link>{" "}
            — cold-start distribution vs quiet pedigree on the same thesis
          </li>
          <li>
            Diligence probe claim → Screen → evidence memo for a $100K
            decision-support check (not an investment offer)
          </li>
        </ol>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionHeading
          label="Judge runbook"
          title="Live investor flow"
          lead="For judges, the deterministic path is one click and ends at the memo."
        />
        <div className="stagger grid gap-4 md:grid-cols-3">
          {JUDGE_RUNBOOK.map((item) => (
            <div key={item.step} className="border-accent/20 border-t pt-4">
              <p className="text-xs font-mono uppercase tracking-wide text-accent">
                {item.step}
              </p>
              <p className="mt-2 text-sm text-muted">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link
            href="/login?next=%2Fapp%2Fradar%3Fauto%3D1%26open_memo%3D1"
            className="btn-primary focus-ring"
          >
            Run judge flow now
          </Link>
        </div>
      </MarketingSection>

      <MarketingSection flush>
        <MarketingSectionHeading
          label="Shared spine"
          title="Same engine as the marketing fleet"
          lead="vibemarketer manufactures distribution. VC Brain measures it to source founders. Shared spine: ingest → memory → reason → trace."
        />
        <div className="cta-box">
          <p className="cta-box__hint">Related</p>
          <div className="cta-box__actions">
            <Link href="/product" className="btn-primary focus-ring">
              Marketing product
            </Link>
            <Link href="/tools/gravity-audit" className="btn-ghost focus-ring">
              Free Gravity Audit
            </Link>
          </div>
        </div>
      </MarketingSection>
    </>
  );
}
