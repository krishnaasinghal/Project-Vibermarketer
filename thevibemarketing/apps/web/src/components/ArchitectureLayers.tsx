type Layer = {
  name: string;
  detail: string;
  accent?: boolean;
};

type Props = {
  title?: string;
  caption?: string;
  layers: Layer[];
};

/** Non-Mermaid architecture stack — readable without JS charting. */
export function ArchitectureLayers({ title, caption, layers }: Props) {
  return (
    <figure className="blog-diagram my-8 overflow-hidden border border-line bg-bg-panel">
      {title ? (
        <figcaption className="border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted">
          {title}
        </figcaption>
      ) : null}
      <ol className="divide-y divide-line" aria-label={title ?? "Architecture layers"}>
        {layers.map((layer, i) => (
          <li
            key={layer.name}
            className={`flex gap-4 px-4 py-4 sm:px-5 ${
              layer.accent ? "bg-accent/[0.06]" : ""
            }`}
          >
            <span className="font-mono text-xs tabular-nums text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-ink">
                {layer.name}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {layer.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {caption ? (
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
          {caption}
        </p>
      ) : null}
    </figure>
  );
}
