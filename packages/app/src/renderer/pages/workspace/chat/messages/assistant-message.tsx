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
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { cn } from "@renderer/lib/utils";
import { sessionStore, type SessionEntry, type ToolExecutionState } from "@renderer/store";
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { AssistantResponseMessage } from "./assistant-response-message";
import { AssistantThinkingMessage } from "./assistant-thinking-message";
import { AssistantToolMessage } from "./assistant-tool-message";
import { SelectionPopup } from "./selection-popup";
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

  // ── Side chat: text selection ────────────────────────────────────────────
  const { invoke } = useElectronIPC();
  const messageRef = useRef<HTMLDivElement | null>(null);
  const [selectionState, setSelectionState] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const model = useStore(sessionStore, (state) => {
    const s = state.getSession(sessionId);
    return s?.model ?? undefined;
  });

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionState(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text || !selection.rangeCount) {
        setSelectionState(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!messageRef.current?.contains(range.commonAncestorContainer)) {
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelectionState({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    }, 10);
  }, []);

  const handleOpenSideChat = useCallback(
    async (selectedText: string) => {
      const text = selectedText.trim();
      if (!text) return;

      setSelectionState(null);
      window.getSelection()?.removeAllRanges();

      const initialPrompt = `我正在研究主对话中的以下内容，请帮我深入分析：\n\n> ${text.split("\n").join("\n> ")}\n\n请针对以上内容进行分析和讨论。`;
      const sideChatId = sessionStore
        .getState()
        .createSideChatArtifact(
          sessionId,
          { sourceEntryId: entryId, selectedText: text },
          model,
          initialPrompt,
        );

      const jsonContent = {
        type: "doc" as const,
        content: [
          { type: "paragraph" as const, content: [{ type: "text" as const, text: initialPrompt }] },
        ],
      };
      const userMessage = createAgentUserMessage(jsonContent, initialPrompt);
      sessionStore.getState().appendSideChatArtifactEntry(sessionId, sideChatId, userMessage);

      if (!model) return;

      try {
        await invoke("setSessionId", sideChatId);
        sessionStore.getState().setSideChatArtifactStatus(sessionId, sideChatId, "running");
        void invoke("prompt", sideChatId, initialPrompt, {
          model: { modelId: model.modelId, providerId: model.providerId },
          skillIds: [],
        });
      } catch (error) {
        console.error("Failed to start side chat:", error);
        sessionStore.getState().setSideChatArtifactStatus(sessionId, sideChatId, "idle");
      }
    },
    [sessionId, entryId, model, invoke],
  );

  const handleDismissSelection = useCallback(() => {
    setSelectionState(null);
  }, []);

  useEffect(() => {
    setIsProcessingOpen(textContent.length === 0);
  }, [textContent.length]);

  return (
    <Message from="assistant" className="gap-1">
      <div ref={messageRef} onMouseUp={handleMouseUp}>
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
          </MessageToolbar>
        ) : null}

        {selectionState && (
          <SelectionPopup
            position={selectionState}
            selectedText={selectionState.text}
            onOpen={handleOpenSideChat}
            onDismiss={handleDismissSelection}
          />
        )}
      </div>
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
