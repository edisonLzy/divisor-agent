import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@renderer/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { createAgentUserMessage } from "@renderer/lib/agent-message";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { cn } from "@renderer/lib/utils";
import { EntryStatus, type ToolExecutionState } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import type { PendingPrompt, PendingPromptInput } from "@shared/pending-prompts-ipc";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
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
    followUpPrompt,
    removePendingPrompt,
    reorderPendingPrompts,
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
  const pendingPrompts = useStore(mainStore, (state) => {
    if (!activeSessionId) {
      return [];
    }

    return state.getPendingPromptsState(activeSessionId).pendingPrompts;
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
                {activeSessionId ? (
                  <PendingPromptsPanel
                    prompts={pendingPrompts}
                    onRemove={removePendingPrompt}
                    onReorder={reorderPendingPrompts}
                  />
                ) : null}

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

interface PendingPromptsPanelProps {
  prompts: PendingPrompt[];
  onRemove: (pendingPromptId: string) => Promise<void> | void;
  onReorder: (sourceIndex: number, targetIndex: number) => Promise<void> | void;
}

function PendingPromptsPanel({ prompts, onRemove, onReorder }: PendingPromptsPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const sourceIndex = prompts.findIndex((item) => item.id === active.id);
      const targetIndex = prompts.findIndex((item) => item.id === over.id);
      if (sourceIndex < 0 || targetIndex < 0) return;
      void onReorder(sourceIndex, targetIndex);
    },
    [prompts, onReorder],
  );

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[0_18px_44px_rgb(0_0_0/0.16)]">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div className="text-xs font-medium text-foreground">Pending Prompts</div>
        <div className="text-[11px] text-muted-foreground">{prompts.length} pending</div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={prompts.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto p-1.5">
            {prompts.map((pendingPrompt, index) => (
              <PendingPromptRow
                key={pendingPrompt.id}
                index={index}
                pendingPrompt={pendingPrompt}
                isFirst={index === 0}
                isLast={index === prompts.length - 1}
                onMoveDown={() => onReorder(index, index + 1)}
                onMoveUp={() => onReorder(index, index - 1)}
                onRemove={() => onRemove(pendingPrompt.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface PendingPromptRowProps {
  index: number;
  pendingPrompt: PendingPrompt;
  isFirst: boolean;
  isLast: boolean;
  onMoveDown: () => Promise<void> | void;
  onMoveUp: () => Promise<void> | void;
  onRemove: () => Promise<void> | void;
}

function PendingPromptRow({
  index,
  pendingPrompt,
  isFirst,
  isLast,
  onMoveDown,
  onMoveUp,
  onRemove,
}: PendingPromptRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: pendingPrompt.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isSteer = pendingPrompt.kind === "steer";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-xs transition-colors hover:border-border/80 hover:bg-muted/30",
        isDragging && "z-10 opacity-70",
      )}
      style={style}
    >
      <button
        type="button"
        className="flex size-7 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label="Drag pending prompt"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {index + 1}.
        </span>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium",
            isSteer
              ? "border-blue-400/20 bg-blue-400/10 text-blue-200"
              : "border-violet-400/20 bg-violet-400/10 text-violet-200",
          )}
        >
          {isSteer ? "Steer" : "Follow-up"}
        </span>
        <span className="truncate text-muted-foreground">{pendingPrompt.content}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={isFirst}
          onClick={() => void onMoveUp()}
          aria-label="Move pending prompt up"
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={isLast}
          onClick={() => void onMoveDown()}
          aria-label="Move pending prompt down"
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void onRemove()}
          aria-label="Remove pending prompt"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

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

  const steerPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId || !isRunning) {
        return;
      }

      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      const entryId = mainStore.getState().appendMessageEntry(activeSessionId, userMessage);
      const pendingPrompt = createPendingPrompt("steer", submission, entryId);
      mainStore.getState().addPendingPrompt(activeSessionId, pendingPrompt);

      try {
        await invoke("steerPrompt", activeSessionId, toPendingPromptInput(pendingPrompt));
      } catch (error) {
        console.error("Failed to create pending steer prompt", error);
        mainStore.getState().removePendingPrompt(activeSessionId, pendingPrompt.id);
        mainStore.getState().removeMessageEntry(activeSessionId, entryId);
      }
    },
    [activeSessionId, invoke, isRunning],
  );

  const followUpPrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (!activeSessionId || !isRunning) {
        return;
      }

      const userMessage = createAgentUserMessage(submission.jsonContent, submission.text);
      const entryId = mainStore.getState().appendMessageEntry(activeSessionId, userMessage);
      const pendingPrompt = createPendingPrompt("followup", submission, entryId);
      mainStore.getState().addPendingPrompt(activeSessionId, pendingPrompt);

      try {
        await invoke("followUpPrompt", activeSessionId, toPendingPromptInput(pendingPrompt));
      } catch (error) {
        console.error("Failed to create pending follow-up prompt", error);
        mainStore.getState().removePendingPrompt(activeSessionId, pendingPrompt.id);
        mainStore.getState().removeMessageEntry(activeSessionId, entryId);
      }
    },
    [activeSessionId, invoke, isRunning],
  );

  const replayPendingPrompts = useCallback(async () => {
    if (!activeSessionId) {
      return;
    }

    const pendingPrompts = mainStore
      .getState()
      .getPendingPromptsState(activeSessionId).pendingPrompts;

    await invoke("clearPendingPrompts", activeSessionId);

    for (const pendingPrompt of pendingPrompts) {
      const input = toPendingPromptInput(pendingPrompt);
      if (pendingPrompt.kind === "steer") {
        await invoke("steerPrompt", activeSessionId, input);
      } else {
        await invoke("followUpPrompt", activeSessionId, input);
      }
    }
  }, [activeSessionId, invoke]);

  const removePendingPrompt = useCallback(
    async (pendingPromptId: string) => {
      if (!activeSessionId) {
        return;
      }

      const pendingPrompt = mainStore
        .getState()
        .getPendingPromptsState(activeSessionId)
        .pendingPrompts.find((item) => item.id === pendingPromptId);
      mainStore.getState().removePendingPrompt(activeSessionId, pendingPromptId);
      if (pendingPrompt?.entryId) {
        mainStore.getState().removeMessageEntry(activeSessionId, pendingPrompt.entryId);
      }
      try {
        await replayPendingPrompts();
      } catch (error) {
        console.error("Failed to replay pending prompts after remove", error);
      }
    },
    [activeSessionId, replayPendingPrompts],
  );

  const reorderPendingPrompts = useCallback(
    async (sourceIndex: number, targetIndex: number) => {
      if (!activeSessionId) {
        return;
      }

      mainStore.getState().reorderPendingPrompts(activeSessionId, sourceIndex, targetIndex);
      const orderedEntryIds = mainStore
        .getState()
        .getPendingPromptsState(activeSessionId)
        .pendingPrompts.map((item) => item.entryId)
        .filter((entryId): entryId is string => Boolean(entryId));
      mainStore.getState().reorderMessageEntries(activeSessionId, orderedEntryIds);
      try {
        await replayPendingPrompts();
      } catch (error) {
        console.error("Failed to replay pending prompts after reorder", error);
      }
    },
    [activeSessionId, replayPendingPrompts],
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
    followUpPrompt,
    isRunning,
    removePendingPrompt,
    reorderPendingPrompts,
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

function createPendingPrompt(
  kind: PendingPrompt["kind"],
  submission: PromptSubmission,
  entryId: string,
): PendingPrompt {
  return {
    id: crypto.randomUUID(),
    entryId,
    kind,
    content: submission.text,
    createdAt: Date.now(),
    metadata: {
      model: {
        modelId: submission.model.modelId,
        providerId: submission.model.providerId,
      },
      skillIds: submission.skillIds,
    },
  };
}

function toPendingPromptInput(pendingPrompt: PendingPrompt): PendingPromptInput {
  return {
    content: pendingPrompt.content,
    createdAt: pendingPrompt.createdAt,
    metadata: pendingPrompt.metadata,
  };
}
