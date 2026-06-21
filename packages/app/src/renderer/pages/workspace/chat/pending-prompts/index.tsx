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
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { createAgentUserMessage, createTextDocument } from "@renderer/lib/agent-message";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import type { PendingPrompt } from "@shared/pending-prompts-ipc";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

export function PendingPromptsPanel({ sessionId }: { sessionId: string }) {
  const { invoke } = useElectronIPC();
  const prompts = useStore(
    mainStore,
    (state) => state.getPendingPromptsState(sessionId).pendingPrompts,
  );

  const replayPendingPrompts = useCallback(async () => {
    const pendingPrompts = mainStore.getState().getPendingPromptsState(sessionId).pendingPrompts;
    if (pendingPrompts.length === 0) return;

    await invoke("clearPendingPrompts", sessionId);
    for (const pendingPrompt of pendingPrompts) {
      const channel = pendingPrompt.kind === "steer" ? "steerPrompt" : "followUpPrompt";
      await invoke(channel, sessionId, {
        content: pendingPrompt.content,
        createdAt: pendingPrompt.createdAt,
        metadata: pendingPrompt.metadata,
      });
    }
  }, [invoke, sessionId]);

  // When the agent actually consumes a pending prompt, move it into the message list.
  useSubscribeAgentEvents(
    {
      message_start: (event) => {
        if (event.message.role !== "user") return;
        const text = getUserMessageText(event.message.content);
        if (!text) return;

        const pendingPrompt = mainStore
          .getState()
          .getPendingPromptsState(sessionId)
          .pendingPrompts.find(
            (item) => item.content === text || item.createdAt === event.message.timestamp,
          );
        if (!pendingPrompt) return;

        const userMessage = createAgentUserMessage(
          createTextDocument(pendingPrompt.content),
          pendingPrompt.content,
        );
        userMessage.timestamp = pendingPrompt.createdAt;
        mainStore.getState().appendMessageEntry(sessionId, userMessage);
        mainStore.getState().removePendingPrompt(sessionId, pendingPrompt.id);
      },
    },
    {
      shouldHandleEvent: (event) => event.scope === "main" && event.sessionId === sessionId,
    },
  );

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
      mainStore.getState().reorderPendingPrompts(sessionId, sourceIndex, targetIndex);
      void replayPendingPrompts().catch((error) => {
        console.error("Failed to replay pending prompts after reorder", error);
      });
    },
    [prompts, replayPendingPrompts, sessionId],
  );

  const handleRemove = useCallback(
    (pendingPromptId: string) => {
      mainStore.getState().removePendingPrompt(sessionId, pendingPromptId);
      void replayPendingPrompts().catch((error) => {
        console.error("Failed to replay pending prompts after remove", error);
      });
    },
    [replayPendingPrompts, sessionId],
  );

  const handleMove = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      mainStore.getState().reorderPendingPrompts(sessionId, sourceIndex, targetIndex);
      void replayPendingPrompts().catch((error) => {
        console.error("Failed to replay pending prompts after reorder", error);
      });
    },
    [replayPendingPrompts, sessionId],
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
                pendingPrompt={pendingPrompt}
                index={index}
                isFirst={index === 0}
                isLast={index === prompts.length - 1}
                onMoveDown={() => handleMove(index, index + 1)}
                onMoveUp={() => handleMove(index, index - 1)}
                onRemove={() => handleRemove(pendingPrompt.id)}
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
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
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
          onClick={onMoveUp}
          aria-label="Move pending prompt up"
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={isLast}
          onClick={onMoveDown}
          aria-label="Move pending prompt down"
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove pending prompt"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function getUserMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block): block is { type: "text"; text: string } => {
      return (
        typeof block === "object" &&
        block !== null &&
        !Array.isArray(block) &&
        block.type === "text" &&
        typeof block.text === "string"
      );
    })
    .map((block) => block.text)
    .join("\n")
    .trim();
}
