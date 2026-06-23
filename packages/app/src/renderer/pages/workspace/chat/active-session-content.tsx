import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import type { ToolExecutionState } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
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
      const submissionText = submission.content;

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
