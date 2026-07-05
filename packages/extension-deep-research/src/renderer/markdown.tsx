import type { ReactNode } from "react";

import type { ResearchSource } from "../common/types";

/** Very small markdown renderer: headings, paragraphs, and [n] citations. */
export function RenderedMarkdown({
  markdown,
  sources,
}: {
  markdown: string;
  sources: ResearchSource[];
}) {
  const lines = markdown.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, idx) => {
    const key = `md-${idx}`;
    if (line.startsWith("# ")) {
      nodes.push(<h2 key={key}>{withCitations(line.slice(2), sources)}</h2>);
    } else if (line.startsWith("## ")) {
      nodes.push(<h3 key={key}>{withCitations(line.slice(3), sources)}</h3>);
    } else if (line.startsWith("> ")) {
      nodes.push(
        <p key={key} className="text-muted-foreground">
          {withCitations(line.slice(2), sources)}
        </p>,
      );
    } else if (line.trim()) {
      nodes.push(<p key={key}>{withCitations(line, sources)}</p>);
    }
  });
  return <>{nodes}</>;
}

/** Turn "[n]" tokens into clickable citation chips that scroll to the source. */
export function withCitations(text: string, sources: ResearchSource[]): ReactNode {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (!m) return <span key={i}>{part}</span>;
    const n = Number(m[1]);
    if (!sources.some((s) => s.id === n)) return <span key={i}>{part}</span>;
    return (
      <a
        key={i}
        href={`#dr-source-${n}`}
        className="mx-0.5 inline-flex h-3.5 min-w-4 items-center justify-center rounded-sm border border-signal-cyan bg-signal-cyan/20 px-1 align-super font-mono text-[9px] font-bold text-foreground no-underline hover:bg-signal-cyan"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(`dr-source-${n}`)?.scrollIntoView({ block: "center" });
        }}
      >
        {n}
      </a>
    );
  });
}
