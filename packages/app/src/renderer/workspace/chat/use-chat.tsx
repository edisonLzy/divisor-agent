import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { sessionStore } from "@renderer/store/session";
import { useCallback, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { useStore } from "zustand";

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
  const state = useStore(sessionStore);

  useSubscribeAgentEvents();

  const messages = useMemo<AgentMessage[]>(() => {
    return state.entries
      .filter((entry) => entry.type === "message")
      .map((entry) => entry.data as AgentMessage);
  }, [state.entries]);

  const toolStates = state.toolStates;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      sessionStore.getState().setLoading(true);

      try {
        await invoke("prompt", {
          sessionId: uuidv4(),
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
    [invoke],
  );

  return {
    isLoading: state.isLoading,
    messages,
    toolStates,
    submitPrompt,
  };
}

// ── Agent message event subscriptions ────────────────────────────────────────

function useSubscribeAgentEvents() {
  const { on } = useElectronIPC();

  useEffect(() => {
    const unsubscribe = [
      on("agent_start", () => {
        sessionStore.getState().setLoading(true);
      }),

      on("agent_end", () => {
        sessionStore.getState().setLoading(false);
        sessionStore.getState().setStreamingEntryId(undefined);
      }),

      on("message_start", (event) => {
        const { message } = event;

        if (message.role === "user") {
          sessionStore.getState().appendMessageEntry(message);
          return;
        }

        if (message.role === "assistant") {
          const entryId = sessionStore.getState().appendMessageEntry(message);
          sessionStore.getState().setStreamingEntryId(entryId);
        }
      }),

      on("message_update", (event) => {
        if (event.message.role !== "assistant") return;

        const entryId = sessionStore.getState().streamingEntryId;
        if (!entryId) return;

        const message = event.message as AssistantMessage;
        sessionStore.getState().updateMessageEntry(entryId, message);

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

        const message = event.message as AssistantMessage;
        const entryId = sessionStore.getState().streamingEntryId;

        if (entryId) {
          sessionStore.getState().updateMessageEntry(entryId, message);
          sessionStore.getState().setStreamingEntryId(undefined);
        } else {
          // Fallback: no prior message_start received — append as new entry
          sessionStore.getState().appendMessageEntry(message);
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
  }, [on]);
}
