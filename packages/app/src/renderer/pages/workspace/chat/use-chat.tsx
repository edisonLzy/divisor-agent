import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type MessageEntry } from "@renderer/store/sessions";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import type { PromptSubmission } from "./prompt-types";

// ── Active session selector ──────────────────────────────────────────────────

function useActiveSessionState() {
  const activeSessionId = useStore(sessionStore, (s) => s.activeSessionId);
  const activeSession = useStore(sessionStore, (s) =>
    activeSessionId ? s.sessions.find((ss) => ss.id === activeSessionId) : undefined,
  );
  return { activeSessionId, activeSession };
}

// ── Public hook ──────────────────────────────────────────────────────────────

export function useChat() {
  const { invoke } = useElectronIPC();
  const { activeSession } = useActiveSessionState();
  const state = useStore(sessionStore);

  const messageEntries = useMemo<MessageEntry[]>(() => {
    return (activeSession?.entries ?? []).filter(isAgentMessageEntry);
  }, [activeSession?.entries]);

  const toolStates = activeSession?.toolStates ?? new Map();

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      const sessionId = state.activeSessionId;
      if (!sessionId) {
        return;
      }

      sessionStore.getState().setLoading(sessionId, true);

      try {
        await invoke("prompt", sessionId, submission.text, {
          modelId: submission.model.modelId,
          providerId: submission.model.providerId,
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        sessionStore.getState().setLoading(sessionId, false);
      }
    },
    [state.activeSessionId, invoke],
  );

  return {
    isLoading: activeSession?.isLoading ?? false,
    messageEntries,
    streamingEntryId: activeSession?.streamingEntryId,
    toolStates,
    submitPrompt,
  };
}
