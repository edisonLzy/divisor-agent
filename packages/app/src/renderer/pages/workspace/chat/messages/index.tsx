import type { MessageEntry, ToolExecutionState } from "@renderer/store/sessions";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

interface ChatMessagesProps {
  messageEntries: MessageEntry[];
  streamingEntryId?: string;
  toolStates: Map<string, ToolExecutionState>;
}

export function ChatMessages({ messageEntries, streamingEntryId, toolStates }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: messageEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    gap: 18,
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
        <div className="rounded-full border border-border bg-background/80 px-5 py-2 text-sm text-muted-foreground shadow-sm">
          Start a conversation
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto pr-2">
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
              className="absolute left-0 top-0 w-full px-2"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="mx-auto w-full max-w-4xl">
                {message.role === "user" ? (
                  <UserMessage message={message} />
                ) : message.role === "assistant" ? (
                  <AssistantMessage
                    completedAt={entry.completedAt}
                    isStreaming={entry.id === streamingEntryId}
                    message={message}
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
  );
}
