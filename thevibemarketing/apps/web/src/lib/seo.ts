import type { Metadata } from "next";
import {
  KEYWORDS,
  SITE_DESCRIPTION,
  SITE_EMAIL,
  SITE_NAME,
  SITE_TAGLINE,
  siteUrl,
} from "@/lib/site";

export function pageMetadata(opts: {
  title: string;
  description?: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string;
  noIndex?: boolean;
}): Metadata {
  const description = opts.description ?? SITE_DESCRIPTION;
  const url = siteUrl(opts.path);
  const title =
    opts.title === SITE_NAME
      ? `${SITE_NAME} — ${SITE_TAGLINE}`
      : opts.title;

  return {
    title: opts.title,
    description,
    keywords: [...KEYWORDS, ...(opts.keywords ?? [])],
    alternates: { canonical: url },
    openGraph: {
      type: opts.type ?? "website",
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: "en_US",
      ...(opts.publishedTime
        ? { publishedTime: opts.publishedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: opts.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": siteUrl("/#organization"),
    name: SITE_NAME,
    url: siteUrl(),
    logo: siteUrl("/brand/logo-full.png"),
    email: SITE_EMAIL,
    description: SITE_DESCRIPTION,
    sameAs: [siteUrl("/llms.txt"), siteUrl("/llms-full.txt")].filter(Boolean),
    contactPoint: {
      "@type": "ContactPoint",
      email: SITE_EMAIL,
      contactType: "customer support",
      availableLanguage: ["en", "hi"],
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteUrl("/#website"),
    name: SITE_NAME,
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    publisher: { "@id": siteUrl("/#organization") },
    inLanguage: "en",
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl("/blog")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": siteUrl("/#software"),
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Marketing automation",
    operatingSystem: "Web",
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    publisher: { "@id": siteUrl("/#organization") },
    creator: { "@id": siteUrl("/#organization") },
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "1499",
      highPrice: "7999",
      priceCurrency: "INR",
      offerCount: "3",
      description: "Starter ₹1,499 · Growth ₹3,999 · Pro ₹7,999 / month",
    },
    featureList: [
      "Brand memory from product URL",
      "On-brand multi-channel drafts",
      "HITL approval queue",
      "SEO and Reddit/HN agents",
      "Honest publish status (never fake published)",
    ],
  };
}

export function marketingServiceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": siteUrl("/#marketing-service"),
    name: "AI marketing operating system for SaaS founders",
    provider: { "@id": siteUrl("/#organization") },
    serviceType: "Agentic marketing, SEO, GEO, AEO, social drafts, and HITL publishing",
    areaServed: [
      { "@type": "Country", name: "India" },
      { "@type": "Place", name: "Global" },
    ],
    audience: {
      "@type": "Audience",
      audienceType: "Technical SaaS founders and small startup teams",
    },
    url: siteUrl("/product"),
    description:
      "Paste a product URL, build brand memory, generate multi-channel drafts, approve in a human-in-the-loop queue, publish only after provider confirmation, and report on outcomes.",
  };
}

export function offerCatalogJsonLd() {
  const plans = [
    {
      name: "Starter",
      price: "1499",
      description: "Solo founder plan with brand memory, Reddit agent, 7-day campaign, and HITL queue.",
    },
    {
      name: "Growth",
      price: "3999",
      description: "Startup plan with SEO and Hacker News agents, L2 auto-queue, and weekly reports.",
    },
    {
      name: "Pro",
      price: "7999",
      description: "Team plan with higher run volume, multi-product brand memory, and onboarding support.",
    },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    "@id": siteUrl("/pricing#offer-catalog"),
    name: "vibemarketer pricing",
    url: siteUrl("/pricing"),
    itemListElement: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: siteUrl("/pricing"),
      description: plan.description,
      itemOffered: { "@id": siteUrl("/#software") },
    })),
  };
}

export function marketingLoopHowToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": siteUrl("/product#marketing-loop-howto"),
    name: "How vibemarketer turns a product URL into approved marketing drafts",
    description:
      "The core vibemarketer loop for founder-led SaaS marketing: context, brand memory, campaign planning, draft generation, approval, provider-confirmed publish, and reporting.",
    totalTime: "PT30M",
    step: [
      "Paste your product URL",
      "Generate brand memory and ICP context",
      "Create a seven-day multi-channel campaign plan",
      "Review X, LinkedIn, Reddit, SEO, and HN drafts",
      "Approve drafts in the HITL queue",
      "Publish only after a connected provider confirms the post",
      "Review outcomes and update brand memory",
    ].map((name, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name,
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}

export function webPageJsonLd(opts: {
  name: string;
  description: string;
  path: string;
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage";
}) {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${siteUrl(opts.path)}#webpage`,
    name: opts.name,
    description: opts.description,
    url: siteUrl(opts.path),
    isPartOf: { "@id": siteUrl("/#website") },
    about: { "@id": siteUrl("/#software") },
    inLanguage: "en",
  };
}

export function itemListJsonLd(opts: {
  name: string;
  description?: string;
  path: string;
  items: Array<{ name: string; path: string; description?: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl(opts.path)}#item-list`,
    name: opts.name,
    description: opts.description,
    url: siteUrl(opts.path),
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: siteUrl(item.path),
      item: {
        "@type": "Thing",
        name: item.name,
        url: siteUrl(item.path),
        ...(item.description ? { description: item.description } : {}),
      },
    })),
  };
}

export function webApplicationJsonLd(opts: {
  name: string;
  description: string;
  path: string;
  applicationCategory?: string;
  operatingSystem?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${siteUrl(opts.path)}#web-application`,
    name: opts.name,
    description: opts.description,
    url: siteUrl(opts.path),
    applicationCategory: opts.applicationCategory ?? "BusinessApplication",
    operatingSystem: opts.operatingSystem ?? "Web",
    browserRequirements: "Requires JavaScript. Uses live provider APIs when configured.",
    publisher: { "@id": siteUrl("/#organization") },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    },
  };
}

export function faqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export function articleJsonLd(opts: {
  title: string;
  description: string;
  path: string;
  date: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    datePublished: opts.date,
    dateModified: opts.date,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: siteUrl("/brand/logo-full.png"),
      },
    },
    mainEntityOfPage: siteUrl(opts.path),
  };
}
