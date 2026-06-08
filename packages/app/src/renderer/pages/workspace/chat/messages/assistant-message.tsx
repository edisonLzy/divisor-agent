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
import { cn } from "@renderer/lib/utils";
import type { SessionEntry, ToolExecutionState } from "@renderer/store";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";
import { CopyMessageButton } from "./toolbar/copy-message-button";
import { ForkMessageButton } from "./toolbar/fork-message-button";
import { MessageToolbar } from "./toolbar/message-toolbar";

interface AssistantMessageProps {
  completedAt?: number;
  entries: SessionEntry[];
  entryId: string;
  isStreaming: boolean;
  message: AssistantMessageType;
  sessionId: string;
  startedAt: number;
  toolStates: Map<string, ToolExecutionState>;
}

export function AssistantMessage({
  completedAt,
  entries,
  entryId,
  isStreaming,
  message,
  sessionId,
  startedAt,
  toolStates,
}: AssistantMessageProps) {
  const contentArray = Array.isArray(message.content) ? message.content : [];
  const errorMessage = message.errorMessage?.trim();
  const hasError =
    message.stopReason === "error" || message.stopReason === "aborted" || Boolean(errorMessage);
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

  const assistantText = textContent.map((block) => block.text).join("\n");

  const [isProcessingOpen, setIsProcessingOpen] = useState(true);

  useEffect(() => {
    setIsProcessingOpen(textContent.length === 0);
  }, [textContent.length]);

  return (
    <Message from="assistant" className="gap-1">
      <Collapsible open={isProcessingOpen} onOpenChange={(open) => setIsProcessingOpen(open)}>
        <div className="flex flex-col gap-2">
          <CollapsibleTrigger className="group/trigger flex cursor-pointer items-center gap-1.5">
            <ProcessingTip
              completedAt={completedAt}
              hasError={hasError}
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

      {hasError && textContent.every((block) => block.text.trim().length === 0) ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
          {errorMessage ||
            "Agent request failed. Please check the model/API configuration and try again."}
        </div>
      ) : null}

      {!hasError ? (
        <MessageToolbar align="start">
          <CopyMessageButton text={assistantText} />
          <ForkMessageButton sessionId={sessionId} entries={entries} targetEntryId={entryId} />
        </MessageToolbar>
      ) : null}
    </Message>
  );
}

interface ProcessingTipProps {
  completedAt?: number;
  hasError: boolean;
  isStreaming: boolean;
  startedAt: number;
}

function ProcessingTip({ completedAt, hasError, isStreaming, startedAt }: ProcessingTipProps) {
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
    <Shimmer
      as="span"
      animate={isStreaming && !hasError}
      className={cn("text-xs text-muted-foreground", hasError && "text-destructive")}
    >
      {`${hasError ? "处理失败" : isStreaming ? "正在处理" : "已处理"} ${elapsed}s`}
    </Shimmer>
  );
}
