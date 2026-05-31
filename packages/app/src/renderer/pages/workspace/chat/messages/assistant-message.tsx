import type {
  AssistantMessage as AssistantMessageType,
  TextContent,
  ThinkingContent,
  ToolCall,
} from "@mariozechner/pi-ai";
import { Message } from "@renderer/components/ai-elements/message";
import { Shimmer } from "@renderer/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { Separator } from "@renderer/components/ui/separator";
import type { ToolExecutionState } from "@renderer/store";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";

interface AssistantMessageProps {
  completedAt?: number;
  isStreaming: boolean;
  message: AssistantMessageType;
  startedAt: number;
  toolStates: Map<string, ToolExecutionState>;
}

export function AssistantMessage({
  completedAt,
  isStreaming,
  message,
  startedAt,
  toolStates,
}: AssistantMessageProps) {
  const contentArray = Array.isArray(message.content) ? message.content : [];
  const { processingContent, textContent } = contentArray.reduce<{
    processingContent: (ThinkingContent | ToolCall)[];
    textContent: TextContent[];
  }>(
    (acc, block) => {
      if (block.type === "thinking" || block.type === "toolCall") {
        acc.processingContent.push(block);
      } else if (block.type === "text") {
        acc.textContent.push(block);
      }
      return acc;
    },
    { processingContent: [], textContent: [] },
  );

  const [isProcessingOpen, setIsProcessingOpen] = useState(true);

  useEffect(() => {
    setIsProcessingOpen(textContent.length === 0);
  }, [textContent.length]);

  return (
    <Message from="assistant">
      <Collapsible open={isProcessingOpen} onOpenChange={(open) => setIsProcessingOpen(open)}>
        <div className="flex flex-col gap-2">
          <CollapsibleTrigger className="group/trigger flex cursor-pointer items-center gap-1.5">
            <ProcessingTip
              completedAt={completedAt}
              isStreaming={isStreaming}
              startedAt={startedAt}
            />
            <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-panel-open/trigger:rotate-90 hover:text-foreground" />
          </CollapsibleTrigger>
          <Separator />
        </div>

        <CollapsibleContent className="mt-2 flex flex-col gap-2">
          {processingContent.map((block) => {
            if (block.type === "thinking") {
              return (
                <AssistantThinkingMessage
                  key={`thinking-${block.thinking.slice(0, 20)}`}
                  content={block.thinking}
                />
              );
            }

            if (block.type === "toolCall") {
              return (
                <AssistantToolMessage
                  key={block.id}
                  toolName={block.name}
                  args={block.arguments}
                  toolState={toolStates.get(block.id)}
                />
              );
            }

            return null;
          })}
        </CollapsibleContent>
      </Collapsible>

      {textContent.map((block, i) => (
        <AssistantResponseMessage key={`text-${i}`} content={block.text} />
      ))}
    </Message>
  );
}

interface ProcessingTipProps {
  completedAt?: number;
  isStreaming: boolean;
  startedAt: number;
}

function ProcessingTip({ completedAt, isStreaming, startedAt }: ProcessingTipProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    setNow(Date.now());

    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [isStreaming, startedAt]);

  const endTime = isStreaming ? now : (completedAt ?? startedAt);
  const elapsed = Math.max(0, Math.floor((endTime - startedAt) / 1000));

  return (
    <Shimmer as="span" animate={isStreaming} className="text-xs text-muted-foreground">
      {`${isStreaming ? "正在处理" : "已处理"} ${elapsed}s`}
    </Shimmer>
  );
}
