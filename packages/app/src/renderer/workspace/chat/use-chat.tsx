import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type MessageEntry } from "@renderer/store/session";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";

import { useWorkspaceSession } from "../session-provider";
import type { PromptSubmission } from "./prompt-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractToolResultText(content: ToolResultMessage["content"]): string {
  return content
    .filter(
      (block): block is Extract<ToolResultMessage["content"][number], { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function formatArgs(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

// ── Public hook ──────────────────────────────────────────────────────────────

export function useChat() {
  const { invoke } = useElectronIPC();
  const {
    activeSessionId,
    isBootstrapping,
    isSwitching,
    persistAssistantMessage,
    persistUserMessage,
  } = useWorkspaceSession();
  const state = useStore(sessionStore);

  useSubscribeAgentEvents({ persistAssistantMessage });

  const messageEntries = useMemo<MessageEntry[]>(() => {
    return state.entries.filter(isAgentMessageEntry);
  }, [state.entries]);

  const toolStates = state.toolStates;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      sessionStore.getState().setLoading(true);

      try {
        await persistUserMessage(submission.text);

        await invoke("prompt", {
          sessionId: activeSessionId,
          content: submission.text,
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        sessionStore.getState().setLoading(false);
      }
    },
    [activeSessionId, invoke, persistUserMessage],
  );

  return {
    isLoading: state.isLoading || isBootstrapping || isSwitching,
    messageEntries,
    streamingEntryId: state.streamingEntryId,
    toolStates,
    submitPrompt,
  };
}

// ── Agent message event subscriptions ────────────────────────────────────────

function useSubscribeAgentEvents({
  persistAssistantMessage,
}: {
  persistAssistantMessage: (message: AssistantMessage) => Promise<void>;
}) {
  const { on } = useElectronIPC();

  useEffect(() => {
    // ── Closure state for multi-turn merging ───────────────────────────────
    // Content index where the current turn starts. Set on turn_start.
    // turnContentStartIndex === 0 → first turn, > 0 → subsequent turn (merge).
    let turnContentStartIndex = 0;

    const unsubscribe = [
      on("agent_start", () => {
        sessionStore.getState().setLoading(true);
      }),

      on("agent_end", () => {
        const { streamingEntryId } = sessionStore.getState();
        if (streamingEntryId) {
          const entry = sessionStore
            .getState()
            .entries.find((item) => item.id === streamingEntryId);

          sessionStore.getState().setMessageCompletedAt(streamingEntryId, Date.now());

          if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
            void persistAssistantMessage(entry.data);
          }
        }
        sessionStore.getState().setLoading(false);
        sessionStore.getState().setStreamingEntryId(undefined);
        turnContentStartIndex = 0;
      }),

      on("turn_start", () => {
        // If we already have a streaming entry (subsequent turn), record where
        // new content should start so message_update/message_end can splice.
        const { streamingEntryId, entries } = sessionStore.getState();
        if (streamingEntryId) {
          const entry = entries.find((e) => e.id === streamingEntryId);
          if (entry && isAgentMessageEntry(entry)) {
            turnContentStartIndex = (entry.data.content ?? []).length;
          }
        }
      }),

      on("message_start", (event) => {
        const { message } = event;

        if (message.role === "toolResult") return;

        if (message.role === "user") {
          sessionStore.getState().appendMessageEntry(message);
          return;
        }

        if (message.role === "assistant") {
          if (turnContentStartIndex === 0) {
            // First assistant turn — create a new entry
            const entryId = sessionStore.getState().appendMessageEntry(message);
            sessionStore.getState().setStreamingEntryId(entryId);
          }
          // Subsequent turn — streamingEntryId already set, no-op here
        }
      }),

      on("message_update", (event) => {
        if (event.message.role !== "assistant") return;

        const { streamingEntryId } = sessionStore.getState();
        if (!streamingEntryId) return;

        const entry = sessionStore.getState().entries.find((e) => e.id === streamingEntryId);
        if (!entry) return;

        if (!isAgentMessageEntry(entry)) return;

        const message = event.message;

        if (turnContentStartIndex === 0) {
          sessionStore.getState().updateMessageEntry(streamingEntryId, message);
        } else {
          const existingContent = entry.data.content ?? [];
          sessionStore.getState().updateMessageEntry(streamingEntryId, {
            ...message,
            content: [
              ...existingContent.slice(0, turnContentStartIndex),
              ...message.content,
            ] as AssistantMessage["content"],
          });
        }

        for (const block of message.content) {
          if (block.type === "toolCall") {
            const tc = block as ToolCall;
            const existing = sessionStore.getState().toolStates.get(tc.id);
            if (!existing) {
              sessionStore.getState().setToolState(tc.id, {
                toolCallId: tc.id,
                toolName: tc.name,
                status: "running",
                args: tc.arguments,
                output: "",
              });
            }
          }
        }
      }),

      on("message_end", (event) => {
        if (event.message.role !== "assistant") return;

        const { streamingEntryId } = sessionStore.getState();
        if (!streamingEntryId) return;

        const entry = sessionStore.getState().entries.find((e) => e.id === streamingEntryId);
        if (!entry) return;

        if (!isAgentMessageEntry(entry)) return;

        const message = event.message as AssistantMessage;

        if (turnContentStartIndex === 0) {
          sessionStore.getState().updateMessageEntry(streamingEntryId, message);
        } else {
          const existingContent = entry.data.content ?? [];
          sessionStore.getState().updateMessageEntry(streamingEntryId, {
            ...message,
            content: [
              ...existingContent.slice(0, turnContentStartIndex),
              ...message.content,
            ] as AssistantMessage["content"],
          });
        }
      }),

      on("tool_execution_start", (event) => {
        const existing = sessionStore.getState().toolStates.get(event.toolCallId);
        if (existing) return;

        sessionStore.getState().setToolState(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: "running",
          args: event.args,
          output: "",
        });
      }),

      on("tool_execution_update", (event) => {
        const existing = sessionStore.getState().toolStates.get(event.toolCallId);
        if (!existing) return;

        sessionStore.getState().setToolState(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: "running",
          args: event.args,
          output: existing?.output ?? "",
        });
      }),

      on("tool_execution_end", (event) => {
        const resultContent = event.result?.content;
        const output = Array.isArray(resultContent)
          ? extractToolResultText(resultContent)
          : formatArgs(event.result);

        sessionStore.getState().setToolState(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: event.isError ? "error" : "done",
          args: sessionStore.getState().toolStates.get(event.toolCallId)?.args ?? {},
          output,
        });
      }),
    ];

    return () => {
      for (const off of unsubscribe) {
        off();
      }
    };
  }, [on, persistAssistantMessage]);
}
