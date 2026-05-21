import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getSessionEntries } from "@renderer/apis/sessions";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import {
  sessionStore,
  type MessageEntry,
  type ModelChangedData,
  type SessionEntry,
  type SessionStatus,
} from "@renderer/store/sessions";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { BottomActions } from "./bottom-actions";
import { TopActions } from "./top-actions";

interface SessionSidebarItem {
  id: string;
  isActive: boolean;
  label: string;
  updatedAtLabel: string;
  status: SessionStatus;
}

function formatRelativeTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffInMinutes < 60) return `${Math.max(1, diffInMinutes)} 分`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} 小时`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} 天`;
}

export function Sessions() {
  const { activeSessionId, sessions: storeSessions } = useStore(sessionStore);
  const handleSelectSession = useSelectSessionHandler();

  const renderedSessions = useMemo<SessionSidebarItem[]>(() => {
    return storeSessions.slice(0, 50).map((session) => ({
      id: session.id,
      isActive: session.id === activeSessionId,
      label: session.name.trim() || "untitled",
      updatedAtLabel: formatRelativeTime(new Date(session.updatedAt)),
      status: session.status,
    }));
  }, [activeSessionId, storeSessions]);

  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border select-none">
      <TopActions />

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col px-1">
          {renderedSessions.length === 0 ? (
            <div className="px-2 py-2 text-[13px] text-muted-foreground/40 break-keep truncate">
              暂无对话
            </div>
          ) : (
            renderedSessions.map((session) => {
              return (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[13px] transition-colors",
                    session.isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <span className="flex items-center min-w-0 flex-1">
                    <span className="truncate pr-2">{session.label}</span>
                    <SessionStatusDot status={session.status} />
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[11px]",
                      session.isActive
                        ? "text-sidebar-accent-foreground/70"
                        : "text-muted-foreground group-hover:text-sidebar-foreground/70",
                    )}
                  >
                    {session.updatedAtLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <BottomActions />
    </div>
  );
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; dotClass: string }> = {
  idle: { label: "", dotClass: "bg-muted-foreground/30" },
  running: { label: "执行中", dotClass: "bg-green-500 animate-pulse" },
  completed: { label: "已完成", dotClass: "bg-blue-500" },
  failed: { label: "失败", dotClass: "bg-red-500" },
};

function SessionStatusDot({ status }: { status: SessionStatus }) {
  const config = STATUS_CONFIG[status];
  if (status === "idle") return null;

  return (
    <span className="flex items-center gap-1 ml-1.5" title={config.label}>
      <span className={cn("size-1.5 rounded-full shrink-0", config.dotClass)} />
      <span className="text-[11px] text-muted-foreground/60">{config.label}</span>
    </span>
  );
}

function useSelectSessionHandler() {
  const { invoke } = useElectronIPC();

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const session = sessionStore.getState().getSession(sessionId);

      // Fetch entries from API if not cached in store
      if (session && session.entries.length === 0) {
        try {
          const entries = await getSessionEntries(sessionId);
          const current = sessionStore.getState().getSession(sessionId);
          if (current) {
            sessionStore.getState().setSessionEntries(
              sessionId,
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

      // Notify main process to create/get the agent for this session
      try {
        await invoke("setSessionId", sessionId);
      } catch (error) {
        console.error("Failed to set session ID:", error);
      }

      // Set agent's conversation history from stored entries
      const updatedSession = sessionStore.getState().getSession(sessionId);
      if (updatedSession && updatedSession.entries.length > 0) {
        const messages = updatedSession.entries
          .filter((e): e is MessageEntry => e.type === "message")
          .map((e) => e.data as AgentMessage);
        try {
          await invoke("setHistoryMessages", sessionId, messages);
        } catch (error) {
          console.error("Failed to set history messages:", error);
        }
      }

      sessionStore.getState().setActiveSessionId(sessionId);
    },
    [invoke],
  );

  return handleSelectSession;
}
