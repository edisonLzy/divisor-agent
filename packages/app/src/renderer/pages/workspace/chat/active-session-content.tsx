import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { EntryStatus, sessionStore, type ToolExecutionState } from "@renderer/store";
import { useCallback } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "./messages";
import { PermissionApprovalPanel } from "./permission";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";

export function ActiveSessionContent() {
  const {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
  } = useActiveSessionChat();
  const activeSessionId = useStore(sessionStore, (state) => state.activeSessionId);
  const pendingPermissionRequest = useStore(sessionStore, (state) => {
    if (!activeSessionId) {
      return null;
    }

    return state.getPermissionState(activeSessionId).requests[0] ?? null;
  });

  return (
    <>
      <section className="min-h-0 flex-1 px-6 pt-6">
        <ChatMessages
          entries={entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={activeSessionId ?? ""}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </section>

      <section className="shrink-0 px-6 pb-6 pt-4">
        {activeSessionId && pendingPermissionRequest ? (
          <PermissionApprovalPanel sessionId={activeSessionId} />
        ) : (
          <PromptInput
            disabled={false}
            isRunning={isRunning}
            onStop={stopPrompt}
            onSubmit={submitPrompt}
            sessionId={activeSessionId}
          />
        )}
      </section>
    </>
  );
}

const EMPTY_TOOL_STATES = new Map<string, ToolExecutionState>();

function useActiveSessionChat() {
  const { invoke } = useElectronIPC();
  const { activeSessionId, sessions } = useStore(sessionStore);
  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId)
    : undefined;
  const entries = activeSession?.entries ?? [];
  const messageEntries = entries.filter(isAgentMessageEntry);
  const toolStates = activeSession?.toolStates ?? EMPTY_TOOL_STATES;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      sessionStore.getState().setSessionStatus(activeSessionId, "running");
      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      const entryId = sessionStore.getState().appendMessageEntry(activeSessionId, userMessage);
      const submissionText = submission.text;

      try {
        await invoke("prompt", activeSessionId, submissionText, {
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
          skillIds: submission.skillIds,
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        sessionStore.getState().setEntryStatus(activeSessionId, [entryId], EntryStatus.Failed);
        sessionStore.getState().setSessionStatus(activeSessionId, "idle");
      }
    },
    [activeSessionId, invoke],
  );

  const stopPrompt = useCallback(async () => {
    if (!activeSessionId) {
      return;
    }

    try {
      await invoke("abortPrompt", activeSessionId);
    } catch (error) {
      console.error("Failed to stop prompt", error);
    }
  }, [activeSessionId, invoke]);

  return {
    entries,
    isRunning: (activeSession?.status ?? "idle") === "running",
    messageEntries,
    streamingEntryId: activeSessionId
      ? sessionStore.getState().streamingEntryIds.get(activeSessionId)
      : undefined,
    stopPrompt,
    toolStates,
    submitPrompt,
  };
}
