import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { EntryStatus, type ToolExecutionState } from "@renderer/store";
import { mainStore } from "@renderer/store/main";
import { useCallback } from "react";
import { useStore } from "zustand";

import { ArtifactsPanel } from "./artifacts";
import { ToggleArtifactPanelButton } from "./artifacts/toggle-artifact-panel-button";
import { FixedActions } from "./fixed-actions";
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
  const activeSessionId = useStore(mainStore, (state) => state.activeSessionId);
  const artifactState = useStore(mainStore, (state) =>
    activeSessionId ? state.getArtifactState(activeSessionId) : null,
  );
  const pendingPermissionRequest = useStore(mainStore, (state) => {
    if (!activeSessionId) {
      return null;
    }

    return state.getPermissionState(activeSessionId).requests[0] ?? null;
  });
  const hasArtifacts = (artifactState?.artifacts.length ?? 0) > 0;
  const isArtifactPanelOpen = Boolean(activeSessionId && artifactState?.isOpen && hasArtifacts);

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize={isArtifactPanelOpen ? "68%" : "100%"} minSize="42%">
        <div className="relative flex h-full min-w-0 flex-col">
          {activeSessionId ? (
            <FixedActions>
              <ToggleArtifactPanelButton sessionId={activeSessionId} />
            </FixedActions>
          ) : null}

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
        </div>
      </ResizablePanel>

      {activeSessionId && isArtifactPanelOpen ? (
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize="32%" minSize="22%" maxSize="48%">
            <ArtifactsPanel sessionId={activeSessionId} />
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}

const EMPTY_TOOL_STATES = new Map<string, ToolExecutionState>();

function useActiveSessionChat() {
  const { invoke } = useElectronIPC();
  const { activeSessionId } = useStore(mainStore);
  const entryState = activeSessionId
    ? mainStore.getState().getEntryState(activeSessionId)
    : { entries: [], toolStates: EMPTY_TOOL_STATES, status: "idle" as const };
  const entries = entryState.entries;
  const messageEntries = entries.filter(isAgentMessageEntry);
  const toolStates = entryState.toolStates;
  const isRunning = entryState.status === "running";

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      mainStore.getState().setStatus(activeSessionId, "running");
      mainStore.getState().setModel(activeSessionId, submission.model);
      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      const entryId = mainStore.getState().appendMessageEntry(activeSessionId, userMessage);
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
        mainStore.getState().setEntryStatus(activeSessionId, [entryId], EntryStatus.Failed);
        mainStore.getState().setStatus(activeSessionId, "idle");
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
    isRunning,
    messageEntries,
    streamingEntryId: activeSessionId
      ? mainStore.getState().streamingEntryIds.get(activeSessionId)
      : undefined,
    stopPrompt,
    toolStates,
    submitPrompt,
  };
}
