import type { ArtifactRenderProps } from "@divisor-agent/extension-core/renderer";

import type { DeepResearchReportContent, ResearchSource } from "../common/types";
import { RenderedMarkdown } from "./markdown";

/** Final report artifact, opened in the right-hand panel. */
export function DeepResearchReportArtifact({
  content,
}: ArtifactRenderProps<DeepResearchReportContent>) {
  const report = content;
  if (!report || typeof report.markdown !== "string") {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
        报告尚未生成。
      </div>
    );
  }

  const sources: ResearchSource[] = Array.isArray(report.sources) ? report.sources : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <RenderedMarkdown markdown={report.markdown} sources={sources} />
        </div>
        {sources.length ? (
          <div className="mt-6 border-t-2 border-border pt-4">
            <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              参考来源（{sources.length}）
            </h4>
            <div className="flex flex-col gap-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  id={`dr-source-${s.id}`}
                  className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 rounded-md border-2 border-border bg-card p-2.5"
                >
                  <span className="grid size-6 place-items-center rounded-sm border border-border bg-signal-cyan font-mono text-[10px] font-bold">
                    {s.id}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{s.title}</div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-mono text-[10px] text-signal-cyan underline"
                    >
                      {s.url}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
