import { isAgentAssistantMessage, isAgentUserMessage } from "@renderer/lib/is";
import type { MessageEntry, SessionEntry, ToolExecutionState } from "@renderer/store/entries-slice";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { AssistantMessage } from "./assistant-message";
import { StickyUserMessage, UserMessage, useStickyUserMessage } from "./user-message";

interface ChatMessagesProps {
  entries: SessionEntry[];
  isRunning: boolean;
  messageEntries: MessageEntry[];
  sessionId: string;
  streamingEntryId?: string;
  toolStates: Map<string, ToolExecutionState>;
}

export function ChatMessages({
  entries,
  isRunning,
  messageEntries,
  sessionId,
  streamingEntryId,
  toolStates,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: messageEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    gap: 18,
  });

  const { activeStickyMessage, handleStickyJump, handleStickyScroll } = useStickyUserMessage({
    messageEntries,
    scrollRef,
    sessionId,
    virtualizer,
  });

  useEffect(() => {
    if (messageEntries.length === 0) {
      return;
    }

    virtualizer.scrollToIndex(messageEntries.length - 1, {
      align: "end",
    });
  }, [messageEntries.length, virtualizer]);

  if (messageEntries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-md border-2 border-border bg-card px-5 py-2 text-sm text-muted-foreground shadow-[var(--hard-shadow-sm)]">
          Start a conversation
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-w-0 overflow-x-hidden">
      <div
        ref={scrollRef}
        className="h-full min-w-0 overflow-x-hidden overflow-y-auto pr-2"
        onScroll={handleStickyScroll}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = messageEntries[virtualRow.index];
            const message = entry.data;
            if (!("role" in message)) return null;

            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full min-w-0 px-2"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="mx-auto w-full max-w-4xl min-w-0">
                  {isAgentUserMessage(message) ? (
                    <UserMessage
                      message={message}
                      entryId={entry.id}
                      sessionId={sessionId}
                      isRunning={isRunning}
                      entries={entries}
                    />
                  ) : isAgentAssistantMessage(message) ? (
                    <AssistantMessage
                      completedAt={entry.completedAt}
                      entries={entries}
                      entryId={entry.id}
                      isStreaming={entry.id === streamingEntryId}
                      message={message}
                      sessionId={sessionId}
                      startedAt={entry.timestamp}
                      toolStates={toolStates}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {activeStickyMessage ? (
        <StickyUserMessage message={activeStickyMessage} onJump={handleStickyJump} />
      ) : null}
    </div>
  );
}
