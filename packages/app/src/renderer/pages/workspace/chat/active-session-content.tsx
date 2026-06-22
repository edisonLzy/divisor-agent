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
import type { PendingPrompt } from "@shared/pending-prompts-ipc";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useStore } from "zustand";

import { ArtifactsPanel } from "./artifacts";
import { ChatMessages } from "./messages";
import { FixedActions, PanelHeader } from "./panel-header";
import { PendingPromptsPanel } from "./pending-prompts";
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
    followUpPrompt,
    steerPrompt,
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
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
                {activeSessionId ? <PendingPromptsPanel sessionId={activeSessionId} /> : null}

                {activeSessionId && pendingPermissionRequest ? (
                  <PermissionApprovalPanel sessionId={activeSessionId} />
                ) : (
                  <PromptInput
                    disabled={false}
                    isRunning={isRunning}
                    onFollowUp={followUpPrompt}
                    onSteer={steerPrompt}
                    onStop={stopPrompt}
                    onSubmit={submitPrompt}
                    sessionId={activeSessionId}
                  />
                )}
              </div>
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
    <button
      type="button"
      className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      onClick={() => {
        const nextIsOpen = !mainStore.getState().getArtifactState(sessionId).isOpen;
        setArtifactPanelOpen(sessionId, nextIsOpen);
      }}
      title={isOpen ? "关闭 Artifact 面板" : "打开 Artifact 面板"}
      aria-label={isOpen ? "Close artifacts panel" : "Open artifacts panel"}
    >
      <Icon className="size-4" />
    </button>
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

  async function enqueuePendingPrompt(
    kind: PendingPrompt["kind"],
    submission: PromptSubmission,
    ipcChannel: "steerPrompt" | "followUpPrompt",
  ) {
    if (!activeSessionId || !isRunning) {
      return;
    }

    const createdAt = Date.now();
    const message = createAgentUserMessage(submission.jsonContent, submission.text);
    message.timestamp = createdAt;

    const pendingPrompt: PendingPrompt = {
      id: uuidv4(),
      kind,
      message,
      metadata: {
        skillIds: submission.skillIds,
      },
    };

    mainStore.getState().addPendingPrompt(activeSessionId, pendingPrompt);

    try {
      await invoke(ipcChannel, activeSessionId, pendingPrompt.message.text, pendingPrompt.metadata);
    } catch (error) {
      console.error(`Failed to enqueue ${kind} prompt`, error);
      mainStore.getState().removePendingPrompt(activeSessionId, pendingPrompt.id);
    }
  }

  function steerPrompt(submission: PromptSubmission) {
    return enqueuePendingPrompt("steer", submission, "steerPrompt");
  }

  function followUpPrompt(submission: PromptSubmission) {
    return enqueuePendingPrompt("followup", submission, "followUpPrompt");
  }

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
    followUpPrompt,
    isRunning,
    messageEntries,
    streamingEntryId: activeSessionId
      ? mainStore.getState().streamingEntryIds.get(activeSessionId)
      : undefined,
    stopPrompt,
    steerPrompt,
    toolStates,
    submitPrompt,
  };
}
