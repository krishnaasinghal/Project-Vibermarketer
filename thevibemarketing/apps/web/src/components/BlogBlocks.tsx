import { ArchitectureLayers } from "@/components/ArchitectureLayers";
import { FlowPipeline } from "@/components/FlowPipeline";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import type { PostBlock } from "@/content/posts";

type Props = {
  blocks: PostBlock[];
};

export function BlogBlocks({ blocks }: Props) {
  return (
    <div className="blog-prose mt-8 space-y-4 text-base leading-relaxed text-muted">
      {blocks.map((block, i) => {
        const key = `${block.type}-${i}`;
        switch (block.type) {
          case "p":
            return (
              <p key={key} className="text-pretty">
                {block.text}
              </p>
            );
          case "h2":
            return (
              <h2
                key={key}
                className="!mt-10 !mb-3 font-display text-2xl font-semibold tracking-tight text-ink"
              >
                {block.text}
              </h2>
            );
          case "callout":
            return (
              <aside
                key={key}
                className={`border px-4 py-3 text-sm leading-relaxed ${
                  block.tone === "warn"
                    ? "border-warn/40 bg-warn/5 text-ink"
                    : block.tone === "accent"
                      ? "border-accent/40 bg-accent/5 text-ink"
                      : "border-line bg-bg-elevated text-muted"
                }`}
              >
                {block.text}
              </aside>
            );
          case "ol":
            return (
              <ol
                key={key}
                className="list-decimal space-y-2 pl-5 text-muted marker:text-accent"
              >
                {block.items.map((item) => (
                  <li key={item.slice(0, 40)} className="pl-1">
                    {item}
                  </li>
                ))}
              </ol>
            );
          case "mermaid":
            return (
              <MermaidDiagram
                key={key}
                code={block.code}
                title={block.title}
                caption={block.caption}
              />
            );
          case "layers":
            return (
              <ArchitectureLayers
                key={key}
                title={block.title}
                caption={block.caption}
                layers={block.layers}
              />
            );
          case "pipeline":
            return (
              <FlowPipeline
                key={key}
                title={block.title}
                caption={block.caption}
                steps={block.steps}
                orientation={block.orientation}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
