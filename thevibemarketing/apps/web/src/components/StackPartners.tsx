import Image from "next/image";

type StackItem = {
  name: string;
  href: string;
  role: string;
  status: "Live" | "Optional" | "Beta";
  statusNote: string;
  /** Local asset under /brands — omit for text wordmark */
  src?: string;
  invertOnDark?: boolean;
  wide?: boolean;
};

/**
 * Technology stack strip — not partners/sponsors/backers.
 * Statuses are honest about what the demo path actually uses.
 */
const STACK: StackItem[] = [
  {
    name: "OpenAI",
    href: "https://openai.com/brand/",
    role: "evidence-grounded extraction and memo synthesis",
    status: "Live",
    statusNote: "cite-bound synthesis when OPENAI is configured",
    src: "/brands/openai.svg",
    invertOnDark: true,
  },
  {
    name: "Tavily",
    href: "https://tavily.com/",
    role: "web research and source discovery",
    status: "Live",
    statusNote: "deep research path when Tavily is configured",
  },
  {
    name: "Supermemory",
    href: "https://supermemory.ai/",
    role: "context and memory retrieval",
    status: "Optional",
    statusNote: "brand memory; Supabase remains canonical investment DB",
  },
  {
    name: "E2B",
    href: "https://e2b.dev/",
    role: "isolated agent execution",
    status: "Beta",
    statusNote: "sandbox forensics when E2B key + repo path succeed",
    src: "/brands/e2b.png",
    wide: true,
  },
];

export function StackPartners() {
  return (
    <section
      className="border-b border-line"
      aria-labelledby="stack-heading"
    >
      <div className="site-shell py-12 sm:py-14">
        <p className="section-label mb-3">Technology stack</p>
        <h2
          id="stack-heading"
          className="font-display max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Built with trusted AI infrastructure
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted">
          Research, memory, reasoning and isolated execution—combined with
          deterministic scoring and human review.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STACK.map((p) => (
            <li key={p.name}>
              <a
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-start gap-3 focus-ring rounded-sm"
              >
                <span className="flex h-12 w-full max-w-[10rem] items-center justify-start border border-line bg-bg-panel px-3 transition-colors group-hover:border-accent/40">
                  {p.src ? (
                    <Image
                      src={p.src}
                      alt={`${p.name} logo`}
                      width={p.wide ? 96 : 28}
                      height={28}
                      style={{ width: "auto", height: "auto" }}
                      className={
                        p.invertOnDark
                          ? "h-7 w-auto max-w-[7rem] object-contain opacity-90 [html[data-theme=dark]_&]:[filter:brightness(0)_invert(1)] group-hover:opacity-100"
                          : "h-7 w-auto max-w-[7rem] object-contain opacity-90 group-hover:opacity-100"
                      }
                      unoptimized
                    />
                  ) : (
                    <span className="font-display text-sm font-semibold tracking-tight text-ink">
                      {p.name}
                    </span>
                  )}
                </span>
                <span>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-base font-semibold text-ink group-hover:text-accent">
                      {p.name}
                    </span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wider ${
                        p.status === "Live"
                          ? "text-ok"
                          : p.status === "Beta"
                            ? "text-warn"
                            : "text-muted"
                      }`}
                    >
                      {p.status === "Beta" ? "Beta / Optional" : p.status}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{p.role}</span>
                  <span className="mt-1 block text-[11px] text-muted/80">
                    {p.statusNote}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
