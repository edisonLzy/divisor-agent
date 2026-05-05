import { Shimmer } from "@renderer/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { ChevronRightIcon } from "lucide-react";

import type { ToolExecutionState } from "../../../store/session";

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

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="group/tool flex w-full cursor-pointer items-center gap-1.5  text-sm">
        <Shimmer as="span" className="text-xs text-[#9E9E9E]" animate={isRunning}>
          {`${statusLabel(toolState?.status)} ${toolName}`}
        </Shimmer>
        <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]/tool:rotate-90 text-[#7C7C7C]" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 pt-3">
          <section className="rounded-2xl bg-[#1E1E1E] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#7C7C7C]">Input</div>
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs leading-6 text-[#B8B8B8]">
              {formatArgs(args) || "{}"}
            </pre>
          </section>

          <section className="rounded-2xl bg-[#1E1E1E] p-3">
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs leading-6 text-[#D4D4D4]">
              {toolState?.output}
            </pre>
          </section>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
