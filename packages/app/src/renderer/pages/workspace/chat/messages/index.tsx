import { isAgentAssistantMessage, isAgentUserMessage } from "@renderer/lib/is";
import type { MessageEntry, SessionEntry, ToolExecutionState } from "@renderer/store/entries-slice";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

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
  const animatedEntryIdsRef = useRef(new Set<string>());
  const [scrollTop, setScrollTop] = useState(0);

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

  const virtualItems = virtualizer.getVirtualItems();
  const visibleStartIndex = virtualItems.find((item) => item.end >= scrollTop + 1)?.index ?? 0;
  const stickyUserIndex = useMemo(() => {
    if (visibleStartIndex <= 0) {
      return null;
    }

    for (let index = visibleStartIndex - 1; index >= 0; index -= 1) {
      const entry = messageEntries[index];
      if (entry && isAgentUserMessage(entry.data)) {
        return index;
      }
    }

    return null;
  }, [messageEntries, visibleStartIndex]);
  const stickyUserEntry = stickyUserIndex === null ? null : messageEntries[stickyUserIndex];

  if (messageEntries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div
          className="rounded-full border border-border bg-background/80 px-5 py-2 text-sm text-muted-foreground shadow-sm"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          Start a conversation
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-y-auto pr-2"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <AnimatePresence initial={false}>
        {stickyUserEntry && isAgentUserMessage(stickyUserEntry.data) ? (
          <motion.div
            key={stickyUserEntry.id}
            className="pointer-events-none sticky top-2 z-20 mx-auto h-0 w-full max-w-4xl px-2"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="pointer-events-auto">
              <UserMessage
                message={stickyUserEntry.data}
                entryId={stickyUserEntry.id}
                sessionId={sessionId}
                isRunning={isRunning}
                entries={entries}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const entry = messageEntries[virtualRow.index];
          const message = entry.data;
          if (!("role" in message)) return null;
          const shouldAnimateEntry = !animatedEntryIdsRef.current.has(entry.id);

          return (
            <motion.div
              key={entry.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full px-2"
              initial={shouldAnimateEntry ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onAnimationComplete={() => animatedEntryIdsRef.current.add(entry.id)}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="mx-auto w-full max-w-4xl">
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
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
