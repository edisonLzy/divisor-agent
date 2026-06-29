import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { Shimmer } from "@renderer/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { formatToolArgs } from "@renderer/lib/agent-tool";
import type { ToolExecutionState } from "@renderer/store/entries-slice";
import { ChevronRightIcon } from "lucide-react";

interface AssistantToolMessageProps {
  args: Record<string, unknown>;
  sessionId: string;
  toolName: string;
  toolState?: ToolExecutionState;
}

function statusLabel(status?: ToolExecutionState["status"]): string {
  switch (status) {
    case "awaiting_user":
      return "等待回答";
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

export function AssistantToolMessage({
  args,
  sessionId,
  toolName,
  toolState,
}: AssistantToolMessageProps) {
  const registry = useExtensionRegistry();
  const isRunning = toolState?.status === "running";
  const output =
    toolState?.output ||
    (toolState?.status === "awaiting_user" ? "Waiting for user response…" : "");
  const assistantBlock = getAssistantBlockDescriptor(toolState?.details);
  const blockRegistration = assistantBlock ? registry.getAssistantBlock(assistantBlock.type) : null;
  const Block = blockRegistration?.render;

  return (
    <div className="flex flex-col gap-2">
      {Block && assistantBlock ? (
        <Block
          props={{
            ...assistantBlock.props,
            sessionId,
          }}
          raw={JSON.stringify(assistantBlock)}
        />
      ) : null}

      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="group/tool flex w-full cursor-pointer items-center gap-1.5 text-sm">
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
                {formatToolArgs(args) || "{}"}
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
    </div>
  );
}

interface AssistantBlockDescriptor {
  props: Record<string, unknown>;
  type: string;
}

function getAssistantBlockDescriptor(details: unknown): AssistantBlockDescriptor | null {
  if (!isRecord(details) || !isRecord(details.assistantBlock)) {
    return null;
  }

  const { assistantBlock } = details;
  if (typeof assistantBlock.type !== "string") {
    return null;
  }

  return {
    props: isRecord(assistantBlock.props) ? assistantBlock.props : {},
    type: assistantBlock.type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
