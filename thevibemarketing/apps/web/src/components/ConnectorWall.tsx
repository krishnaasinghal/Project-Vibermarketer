export type ConnectorStatus = "connect" | "live_key" | "catalog" | "soon";

export type Connector = {
  name: string;
  status: ConnectorStatus;
};

/**
 * Product statuses — connect = OAuth available; live_key = ingest works;
 * catalog = public catalog ingest; soon = not wired yet.
 */
const DEFAULT_CONNECTORS: Connector[] = [
  { name: "Reddit", status: "connect" },
  { name: "X", status: "connect" },
  { name: "LinkedIn", status: "connect" },
  { name: "Hacker News", status: "live_key" },
  { name: "GitHub", status: "live_key" },
  { name: "arXiv", status: "live_key" },
  { name: "Google Analytics", status: "soon" },
  { name: "Search Console", status: "soon" },
  { name: "Gmail", status: "soon" },
  { name: "Notion", status: "soon" },
  { name: "Instagram", status: "soon" },
  { name: "Product Hunt", status: "soon" },
  { name: "Substack", status: "soon" },
  { name: "Slack", status: "soon" },
];

function label(status: ConnectorStatus): { text: string; className: string } {
  if (status === "live_key") {
    return { text: "● live ingest", className: "text-ok" };
  }
  if (status === "catalog") {
    return { text: "○ catalog ingest", className: "text-warn" };
  }
  if (status === "connect") {
    return { text: "○ connect account", className: "text-accent" };
  }
  return { text: "○ coming soon", className: "text-muted" };
}

type Props = {
  connectors?: Connector[];
  staggered?: boolean;
};

export function ConnectorWall({
  connectors = DEFAULT_CONNECTORS,
  staggered = true,
}: Props) {
  return (
    <ul
      className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 ${
        staggered ? "stagger" : ""
      }`}
      aria-label="Platform connectors"
    >
      {connectors.map((c) => {
        const l = label(c.status);
        return (
          <li
            key={c.name}
            className="panel flex flex-col items-start gap-2 px-3 py-3"
          >
            <span className="font-display text-sm font-semibold">{c.name}</span>
            <span
              className={`font-mono text-[10px] uppercase tracking-wider ${l.className}`}
            >
              {l.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
