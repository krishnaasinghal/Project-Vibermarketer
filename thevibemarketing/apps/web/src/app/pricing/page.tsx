import type { Metadata } from "next";
import { CheckoutButton } from "@/components/CheckoutButton";
import { JsonLd } from "@/components/JsonLd";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { WaitlistForm } from "@/components/WaitlistForm";
import { BOOKING_HREF, BOOKING_LABEL } from "@/lib/site";
import { breadcrumbJsonLd, offerCatalogJsonLd, pageMetadata } from "@/lib/seo";
import { PUBLIC_PLANS } from "@/content/plans";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  path: "/pricing",
  description:
    "vibemarketer pricing: Free · Starter ₹1,499 · Growth ₹3,999 · Pro ₹7,999. Built for Indian founders; USD shown for global.",
});

/**
 * Prices from unit-economics model (see hack/plan/research/pricing-financials.md).
 * Target ≥70% gross margin after LLM + scrape COGS; Growth is the default sell.
 * Checkout still maps solo/startup Dodo products until INR SKUs exist.
 */
const tiers = [
  {
    name: "Free",
    tier: null as null,
    priceInr: "₹0",
    priceUsd: "$0",
    period: "",
    forWhom: "Try the marketing loop before you pay",
    features: [
      "Brand memory from your URL",
      "3-channel social drafts + HITL",
      "CMO desk · site scorecard",
      "25 agent runs / mo",
      "Reddit / SEO / HN unlock on paid",
    ],
    checkout: false,
    highlight: false,
    free: true,
  },
  {
    name: PUBLIC_PLANS.starter.name,
    tier: PUBLIC_PLANS.starter.dodoTier,
    priceInr: PUBLIC_PLANS.starter.priceInr,
    priceUsd: PUBLIC_PLANS.starter.priceUsd,
    period: "/mo",
    forWhom: "Solo founders & indie builders",
    features: [
      "Everything in Free",
      "Reddit agent + 7-day campaign",
      "Grok Imagine creatives",
      "120 agent runs / mo",
      "HITL queue · live publish when connected",
    ],
    checkout: true,
    highlight: false,
    free: false,
  },
  {
    name: PUBLIC_PLANS.growth.name,
    tier: PUBLIC_PLANS.growth.dodoTier,
    priceInr: PUBLIC_PLANS.growth.priceInr,
    priceUsd: PUBLIC_PLANS.growth.priceUsd,
    period: "/mo",
    forWhom: "Shipping startups (most teams start here)",
    features: [
      "Everything in Starter",
      "SEO + HN agents",
      "L2 auto-queue (X / LinkedIn)",
      "400 agent runs / mo",
      "Weekly report · priority email",
    ],
    checkout: true,
    highlight: true,
    free: false,
  },
  {
    name: PUBLIC_PLANS.pro.name,
    tier: null as null,
    priceInr: PUBLIC_PLANS.pro.priceInr,
    priceUsd: PUBLIC_PLANS.pro.priceUsd,
    period: "/mo",
    forWhom: "Teams replacing a junior marketer / Okara-class usage",
    features: [
      "Everything in Growth",
      "1,000 agent runs / mo",
      "Multi-product brand memory",
      "GSC / GA when available",
      "Faster support · onboarding call",
    ],
    checkout: false,
    highlight: false,
    free: false,
  },
] as const;

const replaceRows = [
  { what: "Junior marketer", without: "₹25–40k/mo", with: "from ₹1,499" },
  { what: "SEO freelancer", without: "₹15–30k/mo", with: "SEO + GEO agents" },
  { what: "Social + community", without: "₹20–35k/mo", with: "Studio + Reddit/HN" },
  { what: "US AI CMO tools (~$99)", without: "~₹8,300/mo", with: "Pro ₹7,999" },
] as const;

export default async function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
          offerCatalogJsonLd(),
        ]}
      />
      <MarketingPageHero
        label="Pricing"
        title="Simple prices. Real margins."
        lead="India-first INR for builders and MSMEs. USD shown for global founders. Free to start — pay when the fleet is earning its keep."
        actionsHint="New here?"
        actions={
          <>
            <AuthAwareActions
              guest={{
                href: "/signup",
                label: "Start free",
                className: "btn-primary focus-ring text-base",
              }}
              authed={{
                href: "/app/cmo",
                label: "Open app",
                className: "btn-primary focus-ring text-base",
              }}
              guestSecondary={[
                {
                  href: "/get-started",
                  label: "How it works",
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

      <MarketingSection>
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiers.map((t) => (
            <article
              key={t.name}
              className={`panel flex flex-col p-6 sm:p-7 ${
                t.highlight ? "border-accent/50 ring-1 ring-accent/30" : ""
              }`}
            >
              <p
                className={`section-label mb-2 ${t.highlight ? "text-accent" : "invisible"}`}
                aria-hidden={!t.highlight}
              >
                Recommended
              </p>
              <h2 className="font-display text-2xl font-semibold">{t.name}</h2>
              <p className="mt-1 text-sm text-muted">{t.forWhom}</p>
              <p className="mt-6 font-display text-4xl font-bold">
                {t.priceInr}
                {t.period ? (
                  <span className="text-lg font-normal text-muted">
                    {t.period}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-muted">
                {t.free
                  ? "No card · signup only"
                  : `${t.priceUsd}${t.period}/mo USD`}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
                {t.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {t.free ? (
                <AuthAwareActions
                  guest={{
                    href: "/signup",
                    label: "Start free",
                    className:
                      "btn-primary focus-ring mt-6 inline-flex justify-center text-center",
                  }}
                  authed={{
                    href: "/app/cmo",
                    label: "Open app",
                    className:
                      "btn-primary focus-ring mt-6 inline-flex justify-center text-center",
                  }}
                />
              ) : t.checkout && t.tier ? (
                <CheckoutButton
                  tier={t.tier}
                  label={t.highlight ? "Start Growth" : "Start Starter"}
                  highlight={t.highlight}
                />
              ) : (
                <a
                  href={BOOKING_HREF}
                  className="btn-ghost focus-ring mt-6 inline-flex justify-center text-center"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.name === "Pro" ? "Talk to us · Pro" : BOOKING_LABEL}
                </a>
              )}
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <strong className="text-ink">Fleet / agency</strong> — multi-brand from{" "}
          <span className="text-ink">₹20,000/mo</span>.{" "}
          <a href={BOOKING_HREF} className="text-accent hover:underline">
            Book a call
          </a>
          . Annual plans: pay 10 months, get 12.
        </p>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionHeading
          label="Unit economics"
          title="Why these numbers"
          lead="Priced above variable AI/scrape cost so the product stays healthy — not a race to ₹99 forever."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel p-5">
            <p className="section-label mb-2">COGS target</p>
            <p className="font-display text-2xl font-bold">≥70%</p>
            <p className="mt-2 text-sm text-muted">
              Gross margin after LLM, Firecrawl/Tavily, memory, and infra on a
              normal Growth workspace.
            </p>
          </div>
          <div className="panel p-5">
            <p className="section-label mb-2">vs hiring</p>
            <p className="font-display text-2xl font-bold">~5–15%</p>
            <p className="mt-2 text-sm text-muted">
              Of a junior marketer in India (₹25–40k). You keep HITL control;
              agents do the grind.
            </p>
          </div>
          <div className="panel p-5">
            <p className="section-label mb-2">vs US AI CMO</p>
            <p className="font-display text-2xl font-bold">~$99</p>
            <p className="mt-2 text-sm text-muted">
              Okara-class tools sit near $99. Our Pro (~$95) matches capability
              tier; Starter/Growth stay India-accessible.
            </p>
          </div>
        </div>
        <div className="mt-8 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-line bg-bg-panel font-mono text-[10px] uppercase tracking-widest text-muted">
              <tr>
                <th className="p-3">Alternative</th>
                <th className="p-3">Typical cost</th>
                <th className="p-3">vibemarketer</th>
              </tr>
            </thead>
            <tbody>
              {replaceRows.map((r) => (
                <tr key={r.what} className="border-b border-line/60">
                  <td className="p-3 text-ink">{r.what}</td>
                  <td className="p-3 text-muted">{r.without}</td>
                  <td className="p-3 text-accent">{r.with}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted">
          Run meters: Free 25 · Starter 120 · Growth 400 · Pro 1,000 agent
          generations per UTC month (brand, drafts, agents, chat, creative).
          Burst limit 12/min. Checkout maps Starter→solo and Growth→startup in
          Dodo; access unlocks after payment webhook.
        </p>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionHeading
          label="Waitlist"
          title="Questions before paying?"
        />
        <WaitlistForm source="pricing" />
      </MarketingSection>
    </>
  );
}
