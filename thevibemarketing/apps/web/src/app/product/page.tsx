import type { Metadata } from "next";
import Link from "next/link";
import { MARKETING_AGENT_CATALOG } from "@vibe/engine";
import { FeatureGrid } from "@/components/FeatureGrid";
import { AuthAwareActions } from "@/components/AuthAwareCta";
import { JsonLd } from "@/components/JsonLd";
import { LoopDiagram } from "@/components/LoopDiagram";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { AGENT_STATUS_LABEL, FLEET_ROLES } from "@/content/features";
import {
  breadcrumbJsonLd,
  marketingLoopHowToJsonLd,
  pageMetadata,
} from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Product",
  path: "/product",
  description:
    "Cursor for marketing — AI CMO-style agent fleet with brand memory, HITL, studio drafts, connectors, SEO/GEO, and truthful publish.",
});

const STATUS_ORDER = ["live", "partial", "next", "soon", "later"] as const;

export default function ProductPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Product", path: "/product" },
          ]),
          marketingLoopHowToJsonLd(),
        ]}
      />
      <MarketingPageHero
        label="Product"
        title="Cursor for marketing"
        lead="Brand brief from your URL, campaign plans, drafts you approve, and learning from what ships — not another scheduler or one-shot copywriter."
        actionsHint="Marketing product path"
        actions={
          <>
            <AuthAwareActions
              guest={{
                href: "/get-started",
                label: "Get started",
                className: "btn-primary focus-ring text-base",
              }}
              authed={{
                href: "/app/cmo",
                label: "Open CMO desk",
                className: "btn-primary focus-ring text-base",
              }}
              guestSecondary={[
                {
                  href: "/app/cmo",
                  label: "Open CMO desk",
                  className: "btn-ghost focus-ring text-base",
                },
              ]}
              authedSecondary={[
                {
                  href: "/app/onboarding",
                  label: "Open onboarding",
                  className: "btn-ghost focus-ring text-base",
                },
              ]}
            />
          </>
        }
      />

      <MarketingSection tight>
        <nav
          aria-label="Feature jump"
          className="flex flex-wrap gap-2 border-y border-line py-4"
        >
          {[
            ["#features", "All features"],
            ["#loop", "Loop"],
            ["#fleet", "Fleet"],
            ["#trust", "Trust"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="focus-ring px-2 py-1 font-mono text-xs uppercase tracking-widest text-muted hover:text-accent"
            >
              {label}
            </a>
          ))}
        </nav>
      </MarketingSection>

      <MarketingSection id="features" className="scroll-mt-16">
        <MarketingSectionHeading
          label="Feature map"
          title="The core workflow and what is being built next"
          lead="Available paths, beta surfaces, and planned work are labeled so the product does not overclaim."
        />
        <FeatureGrid compact />
      </MarketingSection>

      <MarketingSection id="loop" className="scroll-mt-16">
        <MarketingSectionHeading
          label="Operating loop"
          title="Context → plan → create → approve → publish → review"
          lead="Approval is always available — autonomy is a dial, not a one-way switch."
        />
        <LoopDiagram />
      </MarketingSection>

      <MarketingSection id="fleet" className="scroll-mt-16">
        <MarketingSectionHeading
          label="Fleet"
          title="AI CMO agent wall"
          lead="Category floor: named agents for the jobs a marketing team does. Our wedge: brand memory that does not reset, HITL like Cursor accept, publish only with real provider post IDs — not a fake “always live” CMO."
        />
        <ul className="mb-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FLEET_ROLES.map((agent) => (
            <li key={agent.role} className="bg-bg-panel p-5 sm:p-6">
              <h3 className="font-display text-lg font-semibold text-accent">
                {agent.role}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {agent.job}
              </p>
            </li>
          ))}
        </ul>
        <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted">
          Full catalog · honest status (code-audited)
        </p>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          <span className="text-ok">Live</span> = end-to-end path in code (fails
          closed without keys).{" "}
          <span className="text-accent">Partial</span> = real path, incomplete
          vs definition of done. Soon/later = not built.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...MARKETING_AGENT_CATALOG]
            .sort(
              (a, b) =>
                STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
            )
            .map((agent) => (
              <li
                key={agent.id}
                className="rounded-lg border border-line bg-bg-panel p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {agent.name}
                  </h3>
                  <span
                    className={
                      agent.status === "live"
                        ? "shrink-0 font-mono text-[10px] uppercase tracking-wider text-ok"
                        : agent.status === "next" || agent.status === "partial"
                          ? "shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent"
                          : "shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted"
                    }
                  >
                    {AGENT_STATUS_LABEL[agent.status] ?? agent.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {agent.job}
                </p>
                {"honesty" in agent && agent.honesty ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted/90">
                    {agent.honesty}
                  </p>
                ) : null}
                {agent.href ? (
                  <Link
                    href={agent.href}
                    className="btn-ghost focus-ring mt-3 inline-flex min-h-10 items-center !px-3 !py-2 text-xs"
                  >
                    Open →
                  </Link>
                ) : (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted">
                    No app surface yet
                  </p>
                )}
              </li>
            ))}
        </ul>
        <p className="mt-6 text-xs text-muted">
          Machine-readable catalog:{" "}
          <Link href="/api/marketing/agents" className="text-accent hover:underline">
            /api/marketing/agents
          </Link>
          . Competitive research: Okara-style AI CMO is the checklist; vibemarketer is
          the IDE + runtime.
        </p>
      </MarketingSection>

      <MarketingSection id="trust" className="scroll-mt-16">
        <MarketingSectionHeading label="Trust" title="Security & control" />
        <div className="grid gap-8 md:grid-cols-2">
          <div className="border-t border-line pt-5">
            <h3 className="font-display text-lg font-semibold">Autonomy dial</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Draft-only, approve-to-publish, or supervised engage — per channel.
              High-risk actions always hit the HITL queue.
            </p>
          </div>
          <div className="border-t border-line pt-5">
            <h3 className="font-display text-lg font-semibold">Untrusted ingest</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Scraped pages, decks, and skill files are data — stored and cited,
              never allowed to issue tool calls. Tokens stay server-side.
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection flush>
        <div className="panel border-accent/30 p-6 sm:p-8">
          <p className="section-label mb-2 text-accent">Start free</p>
          <h2 className="font-display text-2xl font-semibold">
            URL → brand → drafts → approve
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted">
            One product promise. Create an account and paste your site.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <AuthAwareActions
              guest={{
                href: "/signup",
                label: "Start free",
                className: "btn-primary focus-ring",
              }}
              authed={{
                href: "/app/cmo",
                label: "Open app",
                className: "btn-primary focus-ring",
              }}
              guestSecondary={[
                {
                  href: "/get-started",
                  label: "Get started",
                  className: "btn-ghost focus-ring",
                },
                {
                  href: "/pricing",
                  label: "Pricing",
                  className: "btn-ghost focus-ring",
                },
              ]}
              authedSecondary={[
                {
                  href: "/app/onboarding",
                  label: "Brand onboarding",
                  className: "btn-ghost focus-ring",
                },
                {
                  href: "/pricing",
                  label: "Pricing",
                  className: "btn-ghost focus-ring",
                },
              ]}
            />
          </div>
        </div>
      </MarketingSection>
    </>
  );
}
