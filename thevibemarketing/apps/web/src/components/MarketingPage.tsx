import type { ReactNode } from "react";
import Link from "next/link";
import { CtaBox } from "@/components/CtaBox";

const HERO_GLOW =
  "radial-gradient(ellipse 55% 70% at 85% 45%, var(--glow-accent), transparent 60%), radial-gradient(ellipse 40% 50% at 10% 80%, var(--glow-cool), transparent 55%)";

type HeroProps = {
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Label above the CTA box (e.g. “Primary action”). */
  actionsHint?: string;
  aside?: ReactNode;
  children?: ReactNode;
  /** Constrain copy column (guides, demo, blog). */
  narrow?: boolean;
};

/** Homepage-matched hero: glow plane + site-shell + rise motion. */
export function MarketingPageHero({
  label,
  title,
  lead,
  actions,
  actionsHint = "What to do next",
  aside,
  children,
  narrow = false,
}: HeroProps) {
  const copy = (
    <div className={narrow || !aside ? "max-w-2xl" : "max-w-2xl"}>
      <p className="rise section-label mb-4">{label}</p>
      <h1 className="rise-delay font-display text-4xl font-bold leading-[0.98] tracking-tight text-ink sm:text-5xl md:text-6xl">
        {title}
      </h1>
      {lead ? (
        <div className="rise-delay-2 mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
          {lead}
        </div>
      ) : null}
      {children ? <div className="rise-delay-2 mt-6">{children}</div> : null}
      {actions ? (
        <div className="rise-delay-2 mt-10">
          <CtaBox hint={actionsHint}>{actions}</CtaBox>
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ background: HERO_GLOW }}
      />
      <div
        className={
          aside
            ? "site-shell relative grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:py-20"
            : "site-shell relative py-14 lg:py-20"
        }
      >
        {copy}
        {aside ? (
          <div className="rise-delay-2 lg:justify-self-end">{aside}</div>
        ) : null}
      </div>
    </section>
  );
}

type SectionProps = {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Drop bottom border (last section / CTA). */
  flush?: boolean;
  tight?: boolean;
};

/** Full-bleed section with homepage site-shell padding. */
export function MarketingSection({
  children,
  id,
  className = "",
  flush = false,
  tight = false,
}: SectionProps) {
  return (
    <section
      id={id}
      className={`${flush ? "" : "border-b border-line"} ${className}`}
    >
      <div
        className={`site-shell ${tight ? "py-10 sm:py-12" : "py-14 sm:py-16"}`}
      >
        {children}
      </div>
    </section>
  );
}

export type MarketingStep = {
  n: string;
  title: string;
  detail: ReactNode;
  href?: string;
  cta?: string;
};

/** Numbered process list — used when order is the information. */
export function MarketingStepList({ steps }: { steps: readonly MarketingStep[] }) {
  return (
    <ol className="stagger space-y-0">
      {steps.map((s) => (
        <li
          key={s.n}
          className="grid gap-3 border-t border-line py-8 sm:grid-cols-[4rem_1fr] sm:gap-6"
        >
          <span className="font-mono text-sm text-accent">{s.n}</span>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              {s.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              {s.detail}
            </p>
            {s.href ? (
              <Link href={s.href} className="step-cta focus-ring">
                {s.cta ?? "Open"} →
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

type HeadingProps = {
  label?: string;
  title: ReactNode;
  lead?: ReactNode;
};

export function MarketingSectionHeading({ label, title, lead }: HeadingProps) {
  return (
    <div className="mb-8 max-w-3xl sm:mb-10">
      {label ? <p className="section-label mb-3">{label}</p> : null}
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          {lead}
        </p>
      ) : null}
    </div>
  );
}
