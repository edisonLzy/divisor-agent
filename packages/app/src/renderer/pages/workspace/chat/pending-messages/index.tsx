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
import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

interface PendingMessagesPanelProps {
  sessionId: string;
}

/**
 * Renders the renderer-side queue of pending steer / follow-up messages.
 *
 * Remove / reorder actions mutate the renderer mirror, clear the main queues,
 * and reinsert the current ordered queue with the existing prompt IPC.
 */
export function PendingMessagesPanel({ sessionId }: PendingMessagesPanelProps) {
  const { invoke } = useElectronIPC();
  const messages = useStore(mainStore, (state) => state.getSessionPendingMessages(sessionId));
  const sortableIds = useMemo(
    () => messages.map((message, index) => getPendingMessageSortableId(message, index)),
    [messages],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const syncAgentQueues = useCallback(() => {
    void (async () => {
      await invoke("clearAllQueues", sessionId);
      for (const message of mainStore.getState().getSessionPendingMessages(sessionId)) {
        await invoke("prompt", sessionId, message);
      }
    })().catch((error) => {
      console.error("Failed to sync pending messages", error);
    });
  }, [invoke, sessionId]);

  const handleRemoveAt = useCallback(
    (index: number) => {
      mainStore.getState().removePendingMessageAt(sessionId, index);
      syncAgentQueues();
    },
    [sessionId, syncAgentQueues],
  );

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      mainStore.getState().reorderPendingMessages(sessionId, fromIndex, toIndex);
      syncAgentQueues();
    },
    [sessionId, syncAgentQueues],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const fromIndex = sortableIds.indexOf(String(active.id));
      const toIndex = sortableIds.indexOf(String(over.id));
      if (fromIndex < 0 || toIndex < 0) return;

      handleMove(fromIndex, toIndex);
    },
    [handleMove, sortableIds],
  );

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[0_18px_44px_rgb(0_0_0/0.16)]">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div className="text-xs font-medium text-foreground">Pending Messages</div>
        <div className="text-[11px] text-muted-foreground">{messages.length} pending</div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto p-1.5">
            {messages.map((message, index) => (
              <PendingMessageRow
                key={sortableIds[index]}
                id={sortableIds[index] ?? getPendingMessageSortableId(message, index)}
                message={message}
                isFirst={index === 0}
                isLast={index === messages.length - 1}
                onMoveDown={() => handleMove(index, index + 1)}
                onMoveUp={() => handleMove(index, index - 1)}
                onRemove={() => handleRemoveAt(index)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface PendingMessageRowProps {
  id: string;
  isFirst: boolean;
  isLast: boolean;
  message: AppUserMessage;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
}

function PendingMessageRow({
  id,
  isFirst,
  isLast,
  message,
  onMoveDown,
  onMoveUp,
  onRemove,
}: PendingMessageRowProps) {
  const kind = message.kind;
  const kindLabel = kind === "steering" ? "Steer" : kind === "follow-up" ? "Follow-up" : "Prompt";
  const kindClass =
    kind === "steering"
      ? "border-blue-400/40 bg-blue-400/10 text-blue-300"
      : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";

  const preview = typeof message.content === "string" ? message.content : "";
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2 text-[12px]",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Drag to reorder"
        className="size-6 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </Button>
      <span
        className={`shrink-0 rounded-md border px-1.5 py-0.5 font-medium text-[10px] tracking-wide uppercase ${kindClass}`}
      >
        {kindLabel}
      </span>
      <div className="min-w-0 flex-1 whitespace-pre-wrap text-foreground/80">{preview}</div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={isFirst}
          onClick={onMoveUp}
          aria-label="Move up"
          className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ArrowUp className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={isLast}
          onClick={onMoveDown}
          aria-label="Move down"
          className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ArrowDown className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label="Remove"
          className="size-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function getPendingMessageSortableId(message: AppUserMessage, index: number) {
  return `${message.timestamp}:${index}`;
}
