import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type ToolExecutionState } from "@renderer/store/sessions";
import { useCallback } from "react";
import { useStore } from "zustand";

import type { PromptSubmission } from "./prompt-types";

const EMPTY_TOOL_STATES = new Map<string, ToolExecutionState>();

// ── Public hook ──────────────────────────────────────────────────────────────

export function useChat() {
  const { invoke } = useElectronIPC();
  const { activeSessionId, sessions } = useStore(sessionStore);
  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId)
    : undefined;
  const messageEntries = (activeSession?.entries ?? []).filter(isAgentMessageEntry);

  const toolStates = activeSession?.toolStates ?? EMPTY_TOOL_STATES;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      const sessionId = activeSessionId;
      if (!sessionId) {
        return;
      }

      sessionStore.getState().setSessionStatus(sessionId, "running");

      try {
        await invoke("prompt", sessionId, submission.text, {
          modelId: submission.model.modelId,
          providerId: submission.model.providerId,
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        sessionStore.getState().setSessionStatus(sessionId, "idle");
      }
    },
    [activeSessionId, invoke],
  );

  return {
    isLoading: (activeSession?.status ?? "idle") === "running",
    messageEntries,
    streamingEntryId: activeSessionId
      ? sessionStore.getState().streamingEntryIds.get(activeSessionId)
      : undefined,
    toolStates,
    submitPrompt,
  };
}
