import type { Session } from "@renderer/apis/sessions";
import { deleteSession, getSessionEntries, pinSession } from "@renderer/apis/sessions";
import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { formatRelativeTime } from "@renderer/lib/date";
import { cn } from "@renderer/lib/utils";
import {
  EntryStatus,
  type AgentMessageData,
  type MessageEntry,
  type ModelChangedData,
  type SessionEntry,
  type SessionStatus,
} from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

interface SessionItemProps {
  session: Session;
}

export function SessionItem({ session }: SessionItemProps) {
  const { activeSessionId } = useStore(mainStore);
  const status = useStore(
    mainStore,
    (state) => state.entryStates.get(session.id)?.status ?? "idle",
  );
  const { invoke } = useElectronIPC();
  const queryClient = useQueryClient();
  const isActive = session.id === activeSessionId;

  const handleSelectSession = useCallback(async () => {
    const entryState = mainStore.getState().getEntryState(session.id);
    if (entryState.entries.length === 0) {
      try {
        const entries = await getSessionEntries(session.id);
        if (mainStore.getState().getSession(session.id)) {
          mainStore.getState().setSessionEntries(
            session.id,
            entries.map((entry): SessionEntry => {
              if (entry.type === "message") {
                return {
                  ...entry,
                  type: "message" as const,
                  data: entry.data as unknown as AgentMessageData,
                  status: EntryStatus.Synced,
                };
              }
              return {
                ...entry,
                type: "model_change" as const,
                data: entry.data as unknown as ModelChangedData,
                status: EntryStatus.Synced,
              };
            }),
          );
        }
      } catch (error) {
        console.error("Failed to fetch session entries:", error);
      }
    }

    try {
      await invoke("setSessionId", session.id);
    } catch (error) {
      console.error("Failed to set session ID:", error);
    }

    const updatedEntries = mainStore.getState().getEntryState(session.id).entries;
    if (updatedEntries.length > 0) {
      const messages = updatedEntries
        .filter((entry): entry is MessageEntry => entry.type === "message")
        .map((entry) => entry.data);
      try {
        await invoke("setHistoryMessages", session.id, messages);
      } catch (error) {
        console.error("Failed to set history messages:", error);
      }
    }

    mainStore.getState().setActiveSessionId(session.id);
  }, [session.id, invoke]);

  const handleTogglePin = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      try {
        await pinSession(session.id, { isTop: !session.isTop });
        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      } catch (error) {
        console.error("Failed to toggle pin:", error);
      }
    },
    [session.id, session.isTop, queryClient],
  );

  async function handleDelete() {
    try {
      await deleteSession({ id: session.id });
      mainStore.getState().removeSession(session.id);
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (error) {
      console.error("Failed to delete session:", error);
      throw error;
    }
  }

  return (
    <div
      className={cn(
        "group/session flex min-h-11 w-full items-center gap-2 rounded-md border-2 border-transparent px-2 py-1 text-[13px] transition-colors",
        isActive
          ? "border-sidebar-border bg-card text-sidebar-accent-foreground shadow-[var(--hard-shadow-sm)]"
          : "hover:border-sidebar-border/30 hover:bg-sidebar-accent",
      )}
    >
      <button
        onClick={handleSelectSession}
        className={cn(
          "flex min-w-0 flex-1 items-center overflow-hidden text-left",
          isActive
            ? "text-sidebar-accent-foreground"
            : "text-sidebar-foreground/78 group-hover/session:text-sidebar-foreground",
        )}
      >
        <SessionAvatar session={session} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold leading-5">
            {session.name.trim() || "untitled"}
          </span>
          <span className="flex min-w-0 items-center gap-2 text-[10px] leading-4 text-sidebar-foreground/45">
            <SessionStatus status={status} />
            <time className="truncate">{formatRelativeTime(new Date(session.updatedAt))}</time>
          </span>
        </span>
      </button>

      <div className="flex min-w-24 shrink-0 justify-end">
        <SessionActions
          isActive={isActive}
          isTop={session.isTop}
          onTogglePin={handleTogglePin}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

const SESSION_TONES = [
  "bg-signal-cyan",
  "bg-signal-green",
  "bg-signal-purple",
  "bg-signal-pink",
  "bg-signal-yellow text-accent-foreground",
] as const;

function SessionAvatar({ session }: { session: Session }) {
  const toneIndex = [...session.id].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const initial = (session.name.trim() || "untitled").slice(0, 1).toUpperCase();

  return (
    <span
      className={cn(
        "mr-2 grid size-7 shrink-0 place-items-center rounded-sm border border-sidebar-border font-mono text-[9px] font-bold text-white",
        SESSION_TONES[toneIndex % SESSION_TONES.length],
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; iconClass: string }> = {
  idle: { label: "", iconClass: "text-muted-foreground/30" },
  running: { label: "执行中", iconClass: "text-signal-green" },
  completed: { label: "已完成", iconClass: "text-signal-cyan" },
  failed: { label: "失败", iconClass: "text-destructive" },
};

function SessionStatus({ status }: { status: SessionStatus }) {
  if (status === "idle") return null;

  if (status === "running") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-sidebar-foreground/55">
        <Loader2 className="size-3 animate-spin" />
        <span>执行中</span>
      </span>
    );
  }

  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1", status === "failed" && "text-destructive")}
    >
      <Square className={cn("size-2 shrink-0 fill-current", config.iconClass)} />
      <span>{config.label}</span>
    </span>
  );
}

interface SessionActionsProps {
  isActive: boolean;
  isTop: boolean;
  onTogglePin: (event: React.MouseEvent) => void;
  onDelete: () => Promise<void>;
}

function SessionActions({ isActive, isTop, onTogglePin, onDelete }: SessionActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirming) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setConfirming(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirming]);

  async function confirmDelete(event: React.MouseEvent) {
    event.stopPropagation();
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex items-center justify-end gap-1 transition-opacity",
        confirming || isActive
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover/session:pointer-events-auto group-hover/session:opacity-100 group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100",
      )}
    >
      {confirming ? (
        <>
          <Button variant="destructive-flat" size="xs" disabled={deleting} onClick={confirmDelete}>
            {deleting ? "删除中" : "确认删除"}
          </Button>
          <Button
            variant="outline-flat"
            size="xs"
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation();
              setConfirming(false);
            }}
          >
            取消
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="outline-flat"
            size="xs"
            onClick={onTogglePin}
            title={isTop ? "取消置顶" : "置顶"}
          >
            {isTop ? "取消置顶" : "置顶"}
          </Button>
          <Button
            variant="destructive-outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              setConfirming(true);
            }}
            title="删除"
          >
            删除
          </Button>
        </>
      )}
    </div>
  );
}
