import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import type { ChatTimelineMessage } from "../chat-types";
import { isUserChatMessage } from "../chat-types";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

interface ChatMessagesProps {
  messages: ChatTimelineMessage[];
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    gap: 18,
  });

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    virtualizer.scrollToIndex(messages.length - 1, {
      align: "end",
    });
  }, [messages.length, virtualizer]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-full border border-[#2A2A2A] px-5 py-2 text-sm text-[#6D6D6D]">
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
          const message = messages[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full px-2"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="mx-auto w-full max-w-4xl">
                {isUserChatMessage(message) ? (
                  <UserMessage message={message} />
                ) : (
                  <AssistantMessage message={message} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
