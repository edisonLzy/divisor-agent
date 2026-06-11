import { Shimmer } from "@renderer/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import type { ToolExecutionState } from "@renderer/store/entries-slice";
import { ChevronRightIcon } from "lucide-react";

interface AssistantToolMessageProps {
  toolName: string;
  args: Record<string, unknown>;
  toolState?: ToolExecutionState;
}

function formatArgs(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function statusLabel(status?: ToolExecutionState["status"]): string {
  switch (status) {
    case "awaiting_approval":
      return "等待确认";
    case "done":
      return "已处理";
    case "error":
      return "错误";
    case "running":
      return "运行中";
    default:
      return "准备中";
  }
}

export function AssistantToolMessage({ toolName, args, toolState }: AssistantToolMessageProps) {
  const isRunning = toolState?.status === "running";
  const output =
    toolState?.output ||
    (toolState?.status === "awaiting_approval" ? "Waiting for permission approval…" : "");

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="group/tool flex w-full cursor-pointer items-center gap-1.5  text-sm">
        <Shimmer as="span" className="text-xs text-muted-foreground" animate={isRunning}>
          {`${statusLabel(toolState?.status)} ${toolName}`}
        </Shimmer>
        <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-panel-open/tool:rotate-90" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3">
          <section className="rounded-2xl border border-border/70 bg-card/80 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Input
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs leading-6 text-muted-foreground">
              {formatArgs(args) || "{}"}
            </pre>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card/80 p-3">
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs leading-6 text-card-foreground">
              {output}
            </pre>
          </section>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
