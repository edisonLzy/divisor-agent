import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Session } from "@renderer/apis/sessions";
import { pinSession, deleteSession, getSessionEntries } from "@renderer/apis/sessions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { formatRelativeTime } from "@renderer/lib/date";
import { cn } from "@renderer/lib/utils";
import {
  type MessageEntry,
  type ModelChangedData,
  type SessionEntry,
  type SessionStatus,
  sessionStore,
} from "@renderer/store/sessions";
import { useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff, MoreHorizontal, Trash2, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

// ── Props ───────────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: Session;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SessionItem({ session }: SessionItemProps) {
  const { activeSessionId } = useStore(sessionStore);
  const { invoke } = useElectronIPC();
  const queryClient = useQueryClient();
  const isActive = session.id === activeSessionId;

  const handleSelectSession = useCallback(async () => {
    const storeSession = sessionStore.getState().getSession(session.id);
    if (storeSession && storeSession.entries.length === 0) {
      try {
        const entries = await getSessionEntries(session.id);
        const current = sessionStore.getState().getSession(session.id);
        if (current) {
          sessionStore.getState().setSessionEntries(
            session.id,
            entries.map((e): SessionEntry => {
              if (e.type === "message") {
                return {
                  ...e,
                  type: "message" as const,
                  data: e.data as unknown as AgentMessage,
                };
              }
              return {
                ...e,
                type: "model_change" as const,
                data: e.data as unknown as ModelChangedData,
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

    const updatedSession = sessionStore.getState().getSession(session.id);
    if (updatedSession && updatedSession.entries.length > 0) {
      const messages = updatedSession.entries
        .filter((e): e is MessageEntry => e.type === "message")
        .map((e) => e.data as AgentMessage);
      try {
        await invoke("setHistoryMessages", session.id, messages);
      } catch (error) {
        console.error("Failed to set history messages:", error);
      }
    }

    sessionStore.getState().setActiveSessionId(session.id);
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

  const handleDelete = useCallback(async () => {
    try {
      await deleteSession({ id: session.id });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  }, [session.id, queryClient]);

  return (
    <div
      className={cn(
        "group flex w-full items-center rounded-md px-2 text-[13px] transition-colors",
        isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent",
      )}
    >
      <button
        onClick={handleSelectSession}
        className={cn(
          "flex min-w-0 flex-1 items-center py-1 text-left",
          isActive
            ? "text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground",
        )}
      >
        <span className="truncate pr-1">{session.name.trim() || "untitled"}</span>
        <SessionStatusDot
          status={sessionStore.getState().getSession(session.id)?.status ?? "idle"}
        />
      </button>

      <span
        className={cn(
          "shrink-0 text-[11px] text-muted-foreground/40 group-hover:hidden mr-1",
          isActive && "hidden",
        )}
      >
        {formatRelativeTime(new Date(session.updatedAt))}
      </span>

      <span className={cn("hidden shrink-0 items-center", "group-hover:flex", isActive && "flex")}>
        <button
          onClick={handleTogglePin}
          className="flex items-center justify-center rounded p-0.5 text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground"
          title={session.isTop ? "取消置顶" : "置顶"}
        >
          {session.isTop ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-center rounded p-0.5 text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground">
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            <DropdownMenuItem onSelect={handleDelete} variant="destructive">
              <Trash2 className="size-3.5" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
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
      <span className="flex items-center gap-1 ml-1.5" title="执行中">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
      </span>
    );
  }

  const config = STATUS_CONFIG[status];
  return (
    <span className="flex items-center gap-1 ml-1.5" title={config?.label}>
      <span className={cn("size-1.5 rounded-full shrink-0", config?.dotClass)} />
      <span className="text-[11px] text-muted-foreground/60">{config?.label}</span>
    </span>
  );
}
