import { useExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";
import {
  CheckCircleIcon,
  CircleIcon,
  FileTextIcon,
  LoaderCircleIcon,
  OctagonXIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react";

import type { ResearchUnitStatus } from "../common/types";
import { cn, getStatusLabel, parseProgressProps, phaseLabel } from "./parse";

/** Live progress block rendered above the deep-research/run tool card. */
export function DeepResearchProgressBlock({ props }: { props: Record<string, unknown> }) {
  const api = useExtensionsContextAPI();
  const block = parseProgressProps(props);
  if (!block) return null;

  const done = block.units.filter((u) => u.status === "completed").length;

  return (
    <div className="not-prose rounded-md border border-border/70 bg-card/70 p-2 text-sm text-card-foreground">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 font-medium">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          Deep Research
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <span>{phaseLabel(block.phase)}</span>
          <span>·</span>
          <span>{block.sourceCount} 源</span>
        </span>
      </div>

      {block.brief ? (
        <div className="mb-2 border-l-2 border-signal-cyan px-2 py-0.5 text-xs text-muted-foreground">
          {block.brief}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        {block.units.map((unit) => {
          const StatusIcon = getStatusIcon(unit.status);
          return (
            <div
              key={unit.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left"
            >
              <StatusIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground",
                  unit.status === "running" && "animate-spin text-signal-cyan",
                  unit.status === "completed" && "text-signal-green",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{unit.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {getStatusLabel(unit.status)}
                    {unit.sourceCount ? ` · ${unit.sourceCount} 源` : ""}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {unit.phase || unit.question}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {block.reflection ? (
        <div className="mt-2 rounded-md border border-dashed border-border/50 bg-signal-purple/15 px-2.5 py-2 text-xs leading-relaxed">
          <span className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
            SUPERVISOR
          </span>{" "}
          {block.reflection}
        </div>
      ) : null}

      {block.phase === "completed" && block.reportArtifactId ? (
        <button
          type="button"
          className="mt-2 flex w-full items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 text-left shadow-[var(--hard-shadow-sm)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
          onClick={() => api.openArtifact(block.parentSessionId, block.reportArtifactId!)}
        >
          <FileTextIcon className="size-4 shrink-0 text-signal-purple" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">查看研究报告</span>
            <span className="block truncate text-xs text-muted-foreground">
              {done}/{block.units.length} 子任务 · {block.sourceCount} 来源
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] font-bold text-signal-purple">
            打开 →
          </span>
        </button>
      ) : null}
    </div>
  );
}

function getStatusIcon(status: ResearchUnitStatus) {
  switch (status) {
    case "aborted":
      return OctagonXIcon;
    case "completed":
      return CheckCircleIcon;
    case "failed":
      return XCircleIcon;
    case "running":
      return LoaderCircleIcon;
    case "queued":
      return CircleIcon;
  }
}
