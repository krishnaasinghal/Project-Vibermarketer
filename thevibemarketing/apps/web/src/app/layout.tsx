import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Syne } from "next/font/google";
import { AuthBypassBanner } from "@/components/AuthBypassBanner";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { Nav } from "@/components/Nav";
import { ThemeScript } from "@/components/ThemeScript";
import { getAuthUser } from "@/lib/auth";
import { isAuthBypassed } from "@/lib/supabase/config";
import {
  KEYWORDS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  siteUrl,
} from "@/lib/site";
import {
  marketingServiceJsonLd,
  organizationJsonLd,
  softwareJsonLd,
  websiteJsonLd,
} from "@/lib/seo";
import "./globals.css";

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: siteUrl() }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  keywords: [...KEYWORDS],
  metadataBase: new URL(siteUrl()),
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": siteUrl("/rss.xml"),
      "application/x-ndjson": siteUrl("/feed.jsonl"),
      "application/json": siteUrl("/answers.json"),
      "text/plain": [
        { url: siteUrl("/llms.txt"), title: "llms.txt" },
        { url: siteUrl("/site-index.txt"), title: "site-index.txt" },
      ],
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/mark-transparent.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  other: {
    "llms-txt": siteUrl("/llms.txt"),
    "ai-content": "llms.txt; llms-full.txt; feed.jsonl; answers.json; site-index.txt; sitemap.xml",
    "geo": "generative engine optimization; answer engine optimization",
    "product-category": "AI marketing operating system for SaaS founders",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = isAuthBypassed() ? null : await getAuthUser();

  return (
    <html
      lang="en"
      className={`${instrument.variable} ${syne.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
      data-theme="dark"
      data-scroll-behavior="smooth"
    >
      <head>
        <ThemeScript />
        <link rel="author" href="/humans.txt" />
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="llms.txt"
        />
        <link
          rel="alternate"
          type="text/plain"
          href="/site-index.txt"
          title="site-index.txt"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${SITE_NAME} Blog RSS`}
          href="/rss.xml"
        />
        <link
          rel="alternate"
          type="application/x-ndjson"
          title="AEO feed"
          href="/feed.jsonl"
        />
        <link
          rel="alternate"
          type="application/json"
          title="AEO answers"
          href="/answers.json"
        />
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        <JsonLd data={softwareJsonLd()} />
        <JsonLd data={marketingServiceJsonLd()} />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <a href="#main-content" className="skip-link focus-ring">
          Skip to main content
        </a>
        <AuthBypassBanner />
        <Nav initialAuthed={Boolean(user)} initialUserEmail={user?.email ?? null} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
