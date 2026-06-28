import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { renameSession } from "@renderer/apis/sessions";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry, isAgentUserMessage } from "@renderer/lib/is";
import { summarizeUsage } from "@renderer/lib/token-usage";
import type { ToolExecutionState } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { useQueryClient } from "@tanstack/react-query";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { ArtifactsPanel } from "./artifacts";
import { ChatMessages } from "./messages";
import { FixedActions, PanelHeader } from "./panel-header";
import { PendingMessagesPanel } from "./pending-messages";
import { PermissionApprovalPanel } from "./permission";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";
import { createSessionTitleFromPrompt, shouldAutoRenameSession } from "./session-title";

interface ActiveSessionContentProps {
  insetForWindowControls: boolean;
}

export function ActiveSessionContent({ insetForWindowControls }: ActiveSessionContentProps) {
  const {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
    usageSummary,
  } = useActiveSessionChat();

  const activeSessionId = useStore(mainStore, (state) => state.activeSessionId!);
  const isArtifactPanelOpen = useStore(
    mainStore,
    (state) => state.getArtifactState(activeSessionId).isOpen,
  );

  const activeSession = useStore(mainStore, (state) =>
    activeSessionId ? state.getSession(activeSessionId) : undefined,
  );
  const pendingPermissionRequest = useStore(mainStore, (state) => {
    if (!activeSessionId) {
      return null;
    }

    return state.getPermissionState(activeSessionId).requests[0] ?? null;
  });
  const sessionName = activeSession?.name.trim() || "untitled";

  return (
    <div className="relative isolate flex min-h-0 flex-1">
      <ResizablePanelGroup
        key={isArtifactPanelOpen ? "with-artifacts" : "chat-only"}
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize={isArtifactPanelOpen ? "68%" : "100%"} minSize="42%">
          <div className="flex h-full min-w-0 flex-col">
            <PanelHeader dragRegion insetForWindowControls={insetForWindowControls}>
              <h1 className="truncate text-sm font-medium text-foreground">{sessionName}</h1>
            </PanelHeader>
            <section className="min-h-0 min-w-0 flex-1 overflow-x-hidden px-6 pt-6">
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
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
                {activeSessionId ? <PendingMessagesPanel sessionId={activeSessionId} /> : null}
                {activeSessionId && pendingPermissionRequest ? (
                  <PermissionApprovalPanel sessionId={activeSessionId} />
                ) : (
                  <PromptInput
                    disabled={false}
                    initialModel={activeSession?.model ?? null}
                    isRunning={isRunning}
                    onFollowUp={followUpPrompt}
                    onSteer={steerPrompt}
                    onStop={stopPrompt}
                    onSubmit={submitPrompt}
                    sessionId={activeSessionId}
                    usageSummary={usageSummary}
                  />
                )}
              </div>
            </motion.section>
          </div>
        </ResizablePanel>

        {isArtifactPanelOpen ? (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="32%" minSize="22%" maxSize="48%" className="min-w-0">
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
  const queryClient = useQueryClient();
  const { activeSessionId } = useStore(mainStore);
  const activeSession = activeSessionId ? mainStore.getState().getSession(activeSessionId) : null;
  const entryState = activeSessionId
    ? mainStore.getState().getEntryState(activeSessionId)
    : { entries: [], toolStates: EMPTY_TOOL_STATES, status: "idle" as const };
  const entries = entryState.entries;
  const messageEntries = entries.filter(isAgentMessageEntry);
  const usageSummary = summarizeUsage(
    messageEntries.flatMap((entry) => (entry.data.role === "assistant" ? [entry.data] : [])),
  );
  const toolStates = entryState.toolStates;
  const isRunning = entryState.status === "running";

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      mainStore.getState().setStatus(activeSessionId, "running");
      mainStore.getState().setModel(activeSessionId, submission.model);
      const submissionText = submission.content;
      const shouldRename =
        shouldAutoRenameSession(activeSession?.name) &&
        !entries.some((entry) => isAgentMessageEntry(entry) && isAgentUserMessage(entry.data));

      if (shouldRename) {
        const title = createSessionTitleFromPrompt(submissionText);
        mainStore.getState().setSessionName(activeSessionId, title);
        void renameSession({ id: activeSessionId, name: title })
          .then(async () => {
            await queryClient.invalidateQueries({ queryKey: ["sessions"] });
          })
          .catch((error) => {
            console.error("Failed to rename session", error);
          });
      }

      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submissionText,
          timestamp: Date.now(),
          kind: "prompt",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to submit prompt", error);
        mainStore.getState().setStatus(activeSessionId, "idle");
      }
    },
    [activeSession?.name, activeSessionId, entries, invoke, queryClient],
  );

  const steerPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "steering",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        mainStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to steer prompt", error);
        mainStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const followUpPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId) {
        return;
      }

      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "follow-up",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        mainStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to queue follow-up prompt", error);
        mainStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
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
    steerPrompt,
    followUpPrompt,
    usageSummary,
  };
}
