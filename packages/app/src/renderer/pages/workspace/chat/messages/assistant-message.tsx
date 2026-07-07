import type {
  AssistantMessage as AssistantMessageType,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from "@earendil-works/pi-ai";
import type { EntryTokenUsage } from "@renderer/apis/sessions";
import { Message } from "@renderer/components/ai-elements/message";
import { Shimmer } from "@renderer/components/ai-elements/shimmer";
import { Badge } from "@renderer/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@renderer/components/ui/hover-card";
import { Progress } from "@renderer/components/ui/progress";
import { Separator } from "@renderer/components/ui/separator";
import { formatPercentage, formatTokenCount } from "@renderer/lib/token-usage";
import { getCacheHitRate } from "@renderer/lib/token-usage";
import { cn } from "@renderer/lib/utils";
import type { SessionEntry, ToolExecutionState } from "@renderer/store/entries-slice";
import { ChevronRightIcon } from "lucide-react";
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
  message: AssistantMessageType;
  sessionId: string;
  startedAt: number;
  tokenUsage?: EntryTokenUsage;
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
  tokenUsage,
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
    <div className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-3">
      <span className="flex size-8.5 items-center justify-center rounded-sm border-2 border-border bg-signal-cyan font-mono text-[10px] font-bold text-accent-foreground shadow-[var(--hard-shadow-sm)]">
        AI
      </span>
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

          {!hasError && !isStreaming ? (
            <MessageToolbar align="start">
              <CopyMessageButton text={assistantText} />
              <ForkMessageButton sessionId={sessionId} entries={entries} targetEntryId={entryId} />
              {tokenUsage ? <MessageUsage usage={tokenUsage.turn} /> : null}
            </MessageToolbar>
          ) : null}
        </FloatingToolbar>
      </Message>
    </div>
  );
}

function MessageUsage({ usage }: { usage: Usage }) {
  if (usage.totalTokens <= 0) return null;

  const cacheHitRate = getCacheHitRate(usage);
  const cacheTone = getCacheTone(cacheHitRate);

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Badge variant="ghost" className="h-5 cursor-default gap-1 border-transparent px-1.5" />
        }
      >
        <span className="text-foreground">{formatTokenCount(usage.totalTokens)}</span>
        {cacheHitRate !== null ? (
          <>
            <span aria-hidden="true" className="text-border/80">
              ·
            </span>
            <span className={cacheTone.textClassName}>{formatPercentage(cacheHitRate)} cache</span>
          </>
        ) : null}
      </HoverCardTrigger>

      <HoverCardContent
        align="start"
        side="top"
        sideOffset={8}
        className="flex w-64 flex-col gap-2.5 p-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] text-muted-foreground">本轮 Token 用量</span>
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {usage.totalTokens.toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
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
              <div className="flex items-center gap-1.5">
                <span className={cn("text-[10px] font-medium", cacheTone.textClassName)}>
                  {cacheTone.label}
                </span>
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {formatPercentage(cacheHitRate)}
                </span>
              </div>
            </div>
            <Progress value={cacheHitRate * 100} className={cacheTone.progressClassName} />
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function UsageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[10px] font-medium tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function getCacheTone(cacheHitRate: number | null) {
  if (cacheHitRate === null) {
    return {
      label: "无数据",
      textClassName: "text-muted-foreground",
      progressClassName: "[&_[data-slot=progress-indicator]]:bg-muted-foreground",
    };
  }

  if (cacheHitRate >= 0.8) {
    return {
      label: "高",
      textClassName: "text-signal-green",
      progressClassName: "[&_[data-slot=progress-indicator]]:bg-signal-green",
    };
  }

  if (cacheHitRate >= 0.5) {
    return {
      label: "中",
      textClassName: "text-signal-yellow",
      progressClassName: "[&_[data-slot=progress-indicator]]:bg-signal-yellow",
    };
  }

  return {
    label: "低",
    textClassName: "text-destructive",
    progressClassName: "[&_[data-slot=progress-indicator]]:bg-destructive",
  };
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
