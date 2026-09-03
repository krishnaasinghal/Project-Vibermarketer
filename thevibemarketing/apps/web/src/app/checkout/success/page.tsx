import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageHero } from "@/components/MarketingPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Checkout complete",
  path: "/checkout/success",
  description: "Thanks for starting with vibemarketer.",
  noIndex: true,
});

/**
 * Success page is UX only — paid access is granted by Dodo webhook → billing_entitlements.
 * Never treat landing here as proof of payment.
 */
export default function CheckoutSuccessPage() {
  return (
    <MarketingPageHero
      narrow
      label="Billing"
      title="Thanks — payment is processing"
      lead={
        <>
          If Dodo confirmed your payment, your plan will show as active once our
          webhook updates entitlements (usually seconds). This page alone does{" "}
          <strong className="text-ink">not</strong> unlock paid features.
          Sign in and check your plan, or open the app to onboard your brand.
        </>
      }
      actions={
        <>
          <Link href="/app" className="btn-primary focus-ring text-base">
            Open app
          </Link>
          <Link
            href="/app/onboarding"
            className="btn-ghost focus-ring text-base"
          >
            Brand onboarding
          </Link>
          <Link href="/pricing" className="btn-ghost focus-ring text-base">
            Back to pricing
          </Link>
        </>
      }
    >
      <p className="mt-6 max-w-lg text-xs text-muted">
        Ops: webhook endpoint{" "}
        <code className="text-ink">/api/webhooks/dodo</code> must receive{" "}
        <code className="text-ink">payment.succeeded</code> /{" "}
        <code className="text-ink">subscription.active</code>. Apply migration{" "}
        <code className="text-ink">billing_entitlements</code> on Supabase.
      </p>
    </MarketingPageHero>
  );
}
