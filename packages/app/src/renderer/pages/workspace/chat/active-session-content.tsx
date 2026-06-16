import { Button } from "@renderer/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { EntryStatus, type ToolExecutionState } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { motion } from "motion/react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { ArtifactsPanel } from "./artifacts";
import { ChatMessages } from "./messages";
import { FixedActions, PanelHeader } from "./panel-header";
import { PermissionApprovalPanel } from "./permission";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";

interface ActiveSessionContentProps {
  isSidebarCollapsed: boolean;
}

export function ActiveSessionContent({ isSidebarCollapsed }: ActiveSessionContentProps) {
  const {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
  } = useActiveSessionChat();

  const activeSessionId = useStore(mainStore, (state) => state.activeSessionId!);

  const activeSession = useStore(mainStore, (state) =>
    activeSessionId ? state.getSession(activeSessionId) : undefined,
  );
  const artifactState = useStore(mainStore, (state) =>
    activeSessionId ? state.getArtifactState(activeSessionId) : null,
  );
  const pendingPermissionRequest = useStore(mainStore, (state) => {
    if (!activeSessionId) {
      return null;
    }

    return state.getPermissionState(activeSessionId).requests[0] ?? null;
  });
  const isArtifactPanelOpen = Boolean(activeSessionId && artifactState?.isOpen);
  const sessionName = activeSession?.name.trim() || "untitled";

  return (
    <div className="relative isolate flex min-h-0 flex-1">
      <ResizablePanelGroup
        key={isArtifactPanelOpen ? "artifacts-open" : "artifacts-closed"}
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize={isArtifactPanelOpen ? "68%" : "100%"} minSize="42%">
          <div className="flex h-full min-w-0 flex-col">
            <PanelHeader dragRegion insetForWindowControls={isSidebarCollapsed}>
              <h1 className="truncate text-sm font-medium text-foreground">{sessionName}</h1>
            </PanelHeader>
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

            <motion.section
              className="shrink-0 px-6 pb-6 pt-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
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
            </motion.section>
          </div>
        </ResizablePanel>

        {isArtifactPanelOpen ? (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="32%" minSize="22%" maxSize="48%">
              <ArtifactsPanel sessionId={activeSessionId} />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      <FixedActions>
        <ToggleArtifactPanelButton sessionId={activeSessionId} />
      </FixedActions>
    </div>
  );
}

const EMPTY_TOOL_STATES = new Map<string, ToolExecutionState>();

interface ToggleArtifactPanelButtonProps {
  sessionId: string;
}

function ToggleArtifactPanelButton({ sessionId }: ToggleArtifactPanelButtonProps) {
  const artifactState = useStore(mainStore, (state) => state.getArtifactState(sessionId));
  const setArtifactPanelOpen = useStore(mainStore, (state) => state.setArtifactPanelOpen);

  const isOpen = artifactState.isOpen;
  const Icon = isOpen ? PanelRightClose : PanelRightOpen;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      className="rounded-lg border border-border/70 bg-background/90 shadow-sm supports-backdrop-filter:backdrop-blur-xl"
      onClick={() => {
        const nextIsOpen = !mainStore.getState().getArtifactState(sessionId).isOpen;
        setArtifactPanelOpen(sessionId, nextIsOpen);
      }}
      aria-label={isOpen ? "Close artifacts panel" : "Open artifacts panel"}
    >
      <Icon />
    </Button>
  );
}

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
