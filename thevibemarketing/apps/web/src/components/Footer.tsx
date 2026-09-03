"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import {
  BOOKING_HREF,
  BOOKING_LABEL,
  SITE_DOMAIN,
  SITE_EMAIL,
  SITE_NAME,
  SOCIAL,
} from "@/lib/site";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/app")) return null;

  return (
    <footer className="border-t border-line bg-bg-elevated">
      <div className="site-shell grid gap-8 py-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <Link
            href="/"
            className="focus-ring inline-flex items-center gap-2"
            aria-label={`${SITE_NAME} home`}
          >
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-lg font-bold tracking-tight">
              <span className="text-accent">vibe</span>
              <span className="text-ink">marketer</span>
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-base text-muted">
            Paste a product URL. Get on-brand drafts. Approve what goes live.
          </p>
          <p className="mt-3 text-sm">
            <a
              href={`mailto:${SITE_EMAIL}`}
              className="focus-ring font-mono text-xs text-accent hover:underline"
            >
              {SITE_EMAIL}
            </a>
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted">
            {SOCIAL.x ? (
              <a
                href={SOCIAL.x}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring hover:text-accent"
              >
                @{SOCIAL.x_handle}
              </a>
            ) : null}
            {SOCIAL.github ? (
              <a
                href={SOCIAL.github}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring hover:text-accent"
              >
                GitHub
              </a>
            ) : null}
            {SOCIAL.portfolio ? (
              <a
                href={SOCIAL.portfolio}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring hover:text-accent"
              >
                0xanand.tech
              </a>
            ) : null}
          </p>
        </div>
        <div>
          <p className="section-label mb-3">Product</p>
          <ul className="space-y-2 text-base text-muted">
            <li>
              <Link href="/#features" className="focus-ring hover:text-accent">
                Features
              </Link>
            </li>
            <li>
              <Link href="/product" className="focus-ring hover:text-accent">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/connectors" className="focus-ring hover:text-accent">
                Connectors
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="focus-ring hover:text-accent">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/get-started" className="focus-ring hover:text-accent">
                Get started
              </Link>
            </li>
            <li>
              <Link href="/demo" className="focus-ring hover:text-accent">
                Demo path
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="section-label mb-3">Start</p>
          <ul className="space-y-2 text-base text-muted">
            <li>
              <Link href="/get-started" className="focus-ring hover:text-accent">
                Get started
              </Link>
            </li>
            <li>
              <Link href="/app/onboarding" className="focus-ring hover:text-accent">
                Brand onboarding
              </Link>
            </li>
            <li>
              <Link href="/app" className="focus-ring hover:text-accent">
                Open app
              </Link>
            </li>
            <li>
              <Link href="/blog" className="focus-ring hover:text-accent">
                Blog
              </Link>
            </li>
            <li>
              <Link href="/newsletter" className="focus-ring hover:text-accent">
                Newsletter
              </Link>
            </li>
            <li>
              <Link href="/guides" className="focus-ring hover:text-accent">
                Guides
              </Link>
            </li>
            <li>
              <a
                href={BOOKING_HREF}
                {...(BOOKING_HREF.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="focus-ring hover:text-accent"
              >
                {BOOKING_LABEL}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="section-label mb-3">SEO · AEO</p>
          <ul className="space-y-2 text-base text-muted">
            <li>
              <a href="/llms.txt" className="focus-ring hover:text-accent">
                llms.txt
              </a>
            </li>
            <li>
              <a href="/llms-full.txt" className="focus-ring hover:text-accent">
                llms-full.txt
              </a>
            </li>
            <li>
              <a href="/site-index.txt" className="focus-ring hover:text-accent">
                site-index.txt
              </a>
            </li>
            <li>
              <a href="/feed.jsonl" className="focus-ring hover:text-accent">
                feed.jsonl
              </a>
            </li>
            <li>
              <a href="/answers.json" className="focus-ring hover:text-accent">
                answers.json
              </a>
            </li>
            <li>
              <a href="/rss.xml" className="focus-ring hover:text-accent">
                RSS
              </a>
            </li>
            <li>
              <a href="/sitemap.xml" className="focus-ring hover:text-accent">
                Sitemap
              </a>
            </li>
            <li>
              <a href="/robots.txt" className="focus-ring hover:text-accent">
                robots.txt
              </a>
            </li>
            <li>
              <a href="/humans.txt" className="focus-ring hover:text-accent">
                humans.txt
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="site-shell flex flex-wrap items-center justify-between gap-2 py-4 text-sm text-muted/70">
          <p>
            © {new Date().getFullYear()} {SITE_DOMAIN}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider">
            Built to be cited · AEO-ready
          </p>
        </div>
      </div>
    </footer>
  );
}
