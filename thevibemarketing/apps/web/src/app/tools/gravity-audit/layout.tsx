import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata, webApplicationJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Distribution Gravity Audit",
  path: "/tools/gravity-audit",
  description:
    "Free tool: score public distribution gravity from a GitHub handle or signals. Same engine as VC Brain — not investment advice.",
  keywords: ["distribution gravity", "founder score", "GitHub gravity audit"],
});

export default function GravityAuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Distribution Gravity Audit", path: "/tools/gravity-audit" },
          ]),
          webApplicationJsonLd({
            name: "Distribution Gravity Audit",
            path: "/tools/gravity-audit",
            description:
              "Free vibemarketer tool that scores public distribution gravity from live GitHub signals using deterministic math.",
            applicationCategory: "BusinessApplication",
          }),
        ]}
      />
      {children}
    </>
  );
}
