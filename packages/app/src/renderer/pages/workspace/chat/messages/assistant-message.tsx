import type { TextContent, ThinkingContent, ToolCall, Usage } from "@earendil-works/pi-ai";
import { Message } from "@renderer/components/ai-elements/message";
import { Shimmer } from "@renderer/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import { Progress } from "@renderer/components/ui/progress";
import { Separator } from "@renderer/components/ui/separator";
import { formatPercentage, formatTokenCount } from "@renderer/lib/token-usage";
import { cn } from "@renderer/lib/utils";
import type { SessionEntry, ToolExecutionState } from "@renderer/store/entries-slice";
import { getCacheHitRate } from "@shared/token-usage";
import type { AppAssistantMessage } from "@shared/token-usage";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";
import { FloatingToolbar } from "./floating-toolbar";
import { CopyMessageButton } from "./toolbar/copy-message-button";
import { ForkMessageButton } from "./toolbar/fork-message-button";
import { MessageToolbar } from "./toolbar/message-toolbar";

interface AssistantMessageProps {
  completedAt?: number;
  entries: SessionEntry[];
  entryId: string;
  isStreaming: boolean;
  message: AppAssistantMessage;
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
      <FloatingToolbar entryId={entryId} sessionId={sessionId}>
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
                    sessionId={sessionId}
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
          <AssistantResponseMessage
            key={`text-${i}`}
            content={block.text}
            entryId={entryId}
            isStreaming={isStreaming}
            sessionId={sessionId}
          />
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
            <MessageUsage usage={message.turnUsage ?? message.usage} />
          </MessageToolbar>
        ) : null}
      </FloatingToolbar>
    </Message>
  );
}

function MessageUsage({ usage }: { usage: Usage }) {
  if (usage.totalTokens <= 0) return null;

  const cacheHitRate = getCacheHitRate(usage);

  return (
    <Popover>
      <PopoverTrigger className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <span>
          <strong className="font-medium text-foreground">
            {formatTokenCount(usage.totalTokens)}
          </strong>{" "}
          tokens
        </span>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <span>
          <strong className="font-medium text-foreground">
            {formatTokenCount(usage.cacheRead)}
          </strong>{" "}
          cached
        </span>
        {cacheHitRate !== null ? (
          <>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <span>{formatPercentage(cacheHitRate)} 命中</span>
          </>
        ) : null}
        <ChevronDownIcon className="size-3" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-72 rounded-2xl border border-border/80 bg-popover/96 p-3.5 shadow-[0_18px_48px_rgb(15_23_42/0.16)] backdrop-blur-xl"
      >
        <PopoverHeader>
          <PopoverDescription>本轮 Token 用量</PopoverDescription>
          <PopoverTitle className="text-lg tabular-nums">
            {usage.totalTokens.toLocaleString()}
          </PopoverTitle>
        </PopoverHeader>

        <div className="grid grid-cols-2 gap-2">
          <UsageMetric label="输入" value={usage.input} />
          <UsageMetric label="输出" value={usage.output} />
          <UsageMetric label="缓存读取" value={usage.cacheRead} />
          <UsageMetric label="缓存写入" value={usage.cacheWrite} />
        </div>

        {cacheHitRate !== null ? (
          <div className="flex flex-col gap-2">
            <Separator />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">缓存命中率</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatPercentage(cacheHitRate)}
              </span>
            </div>
            <Progress value={cacheHitRate * 100} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function UsageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/70 px-3 py-2.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
    </div>
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
