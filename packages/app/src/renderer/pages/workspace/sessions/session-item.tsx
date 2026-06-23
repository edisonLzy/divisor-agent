import type { Session } from "@renderer/apis/sessions";
import { pinSession, deleteSession, getSessionEntries } from "@renderer/apis/sessions";
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
import { Pin, PinOff, Trash2, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

// ── Props ───────────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: Session;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SessionItem({ session }: SessionItemProps) {
  const { activeSessionId } = useStore(mainStore);
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
            entries.map((e): SessionEntry => {
              if (e.type === "message") {
                return {
                  ...e,
                  type: "message" as const,
                  data: e.data as unknown as AgentMessageData,
                  status: EntryStatus.Synced,
                };
              }
              return {
                ...e,
                type: "model_change" as const,
                data: e.data as unknown as ModelChangedData,
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
        .filter((e): e is MessageEntry => e.type === "message")
        .map((e) => e.data);
      try {
        await invoke("setHistoryMessages", session.id, messages);
      } catch (error) {
        console.error("Failed to set history messages:", error);
      }
    }

    mainStore.getState().setActiveSessionId(session.id);
  }, [session.id, invoke]);

  const handleTogglePin = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
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

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await deleteSession({ id: session.id });
        mainStore.getState().removeSession(session.id);
        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    },
    [session.id, queryClient],
  );

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-[background-color,color]",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.03)]"
          : "hover:bg-sidebar-accent/80",
      )}
    >
      <button
        onClick={handleSelectSession}
        className={cn(
          "flex min-w-0 flex-1 items-center overflow-hidden text-left leading-5",
          isActive
            ? "font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/78 group-hover:text-sidebar-foreground",
        )}
      >
        <span className="truncate pr-2">{session.name.trim() || "untitled"}</span>
        <SessionStatusDot status={mainStore.getState().getEntryState(session.id).status} />
      </button>

      <div className="relative shrink-0 flex justify-end min-w-[3.25rem]">
        <span
          className={cn(
            "text-[11px] text-sidebar-foreground/32 group-hover:invisible",
            isActive && "hidden pointer-events-none",
          )}
        >
          {formatRelativeTime(new Date(session.updatedAt))}
        </span>

        <span
          className={cn(
            "absolute inset-0 flex items-center justify-end gap-0.5",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isActive && "opacity-100",
          )}
        >
          <button
            onClick={handleTogglePin}
            className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/32 transition-colors hover:bg-black/10 hover:text-sidebar-foreground"
            title={session.isTop ? "取消置顶" : "置顶"}
          >
            {session.isTop ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/32 transition-colors hover:bg-black/10 hover:text-red-400"
            title="删除"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SessionStatus, { label: string; dotClass: string }> = {
  idle: { label: "", dotClass: "bg-muted-foreground/30" },
  running: { label: "执行中", dotClass: "bg-green-500 animate-pulse" },
  completed: { label: "已完成", dotClass: "bg-blue-500" },
  failed: { label: "失败", dotClass: "bg-red-500" },
};

function SessionStatusDot({ status }: { status: SessionStatus }) {
  if (status === "idle") return null;

  if (status === "running") {
    return (
      <span className="ml-1.5 flex items-center gap-1" title="执行中">
        <Loader2 className="size-3.5 animate-spin text-sidebar-foreground/45" />
      </span>
    );
  }

  const config = STATUS_CONFIG[status];
  return (
    <span className="ml-1.5 flex items-center gap-1" title={config?.label}>
      <span className={cn("size-1.5 rounded-full shrink-0", config?.dotClass)} />
      <span className="text-[11px] text-sidebar-foreground/45">{config?.label}</span>
    </span>
  );
}
