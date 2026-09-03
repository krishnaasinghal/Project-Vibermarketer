import type { Metadata } from "next";
import Link from "next/link";
import { ConnectorWall } from "@/components/ConnectorWall";
import { JsonLd } from "@/components/JsonLd";
import {
  MarketingPageHero,
  MarketingSection,
  MarketingSectionHeading,
} from "@/components/MarketingPage";
import { breadcrumbJsonLd, itemListJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Connectors",
  path: "/connectors",
  description:
    "Live Identify from GitHub, HN, and arXiv, plus Composio OAuth for Reddit, X, LinkedIn, and more.",
});

export default function ConnectorsPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            name: "vibemarketer connectors",
            path: "/connectors",
            description:
              "Connector wall for vibemarketer marketing workflows, including Reddit, X, LinkedIn, Hacker News, GitHub, arXiv, and planned analytics/search channels.",
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Connectors", path: "/connectors" },
          ]),
          itemListJsonLd({
            name: "vibemarketer connector categories",
            path: "/connectors",
            description:
              "Marketing channels and data sources available or planned for the vibemarketer agentic marketing loop.",
            items: [
              { name: "Reddit", path: "/connectors", description: "OAuth connect account for approved community marketing workflows." },
              { name: "X", path: "/connectors", description: "OAuth connect account for approved social publishing workflows." },
              { name: "LinkedIn", path: "/connectors", description: "OAuth connect account for approved founder-led social drafts." },
              { name: "Hacker News", path: "/connectors", description: "Live public ingest for founder and launch signal research." },
              { name: "GitHub", path: "/connectors", description: "Live public ingest for technical founder and project signals." },
              { name: "arXiv", path: "/connectors", description: "Live public ingest for research and technical market signals." },
            ],
          }),
        ]}
      />
      <MarketingPageHero
        label="Connectors"
        title="The wall"
        lead="Founder channels first. Ingest runs live where public APIs allow. Connect publish accounts via Composio OAuth. Curated Product Hunt / accelerator rows are labeled when not live API ingest."
        actions={
          <>
            <Link
              href="/app/connectors"
              className="btn-primary focus-ring text-base"
            >
              Connect accounts
            </Link>
            <Link href="/app/studio" className="btn-ghost focus-ring text-base">
              Studio loops
            </Link>
          </>
        }
      />

      <MarketingSection>
        <ConnectorWall />
      </MarketingSection>

      <MarketingSection flush>
        <MarketingSectionHeading
          label="Security"
          title="Tokens stay server-side"
          lead="Scraped and uploaded content is untrusted data — stored and cited, never allowed to issue tool calls. Live publish only after HITL approve + provider post ID; workspace rate limits protect generation and approve bursts."
        />
      </MarketingSection>
    </>
  );
}
