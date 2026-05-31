import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type ToolExecutionState } from "@renderer/store";
import { useCallback } from "react";
import { useStore } from "zustand";

import { ChatMessages } from "./messages";
import { PermissionApprovalPanel } from "./permission";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";

export function ActiveSessionContent() {
  const { isLoading, messageEntries, streamingEntryId, toolStates, submitPrompt } =
    useActiveSessionChat();
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
          messageEntries={messageEntries}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </section>

      <section className="shrink-0 px-6 pb-6 pt-4">
        {activeSessionId && pendingPermissionRequest ? (
          <PermissionApprovalPanel sessionId={activeSessionId} />
        ) : (
          <PromptInput disabled={isLoading} onSubmit={submitPrompt} sessionId={activeSessionId} />
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
  const messageEntries = (activeSession?.entries ?? []).filter(isAgentMessageEntry);
  const toolStates = activeSession?.toolStates ?? EMPTY_TOOL_STATES;

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      sessionStore.getState().setSessionStatus(activeSessionId, "running");

      try {
        await invoke("prompt", activeSessionId, submission.text, {
          modelId: submission.model.modelId,
          providerId: submission.model.providerId,
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        sessionStore.getState().setSessionStatus(activeSessionId, "idle");
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
