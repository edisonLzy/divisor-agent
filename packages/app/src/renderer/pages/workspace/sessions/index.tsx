import { getSessionDetail, listSessions } from "@renderer/apis/sessions";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import {
  sessionStore,
  type AgentSession,
  type SessionEntry,
  type SessionStatus,
} from "@renderer/store/sessions";
import { useQuery } from "@tanstack/react-query";
import { Settings, SquarePen } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "zustand";

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

function useSessionSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { invoke } = useElectronIPC();
  const activeSessionId = useStore(sessionStore, (s) => s.activeSessionId);
  const storeSessions = useStore(sessionStore, (s) => s.sessions);

  // Fetch session list from API
  const { data: apiSessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });

  // Sync API sessions to store
  useEffect(() => {
    if (apiSessions) {
      sessionStore.getState().setSessions(
        apiSessions.map(
          (s) =>
            ({
              ...s,
              entries: [],
              model: undefined,
              isLoading: false,
              streamingEntryId: undefined,
              toolStates: new Map(),
              status: "idle",
            }) as AgentSession,
        ),
      );
    }
  }, [apiSessions]);

  const handleCreateSession = useCallback(() => {
    // TODO: implement session creation
  }, []);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const session = sessionStore.getState().getSession(sessionId);

      // Fetch entries from API if not cached in store
      if (session && session.entries.length === 0) {
        try {
          const detail = await getSessionDetail({ id: sessionId });
          sessionStore
            .getState()
            .setSessionEntries(sessionId, detail.entries as unknown as SessionEntry[]);
        } catch (error) {
          console.error("Failed to fetch session details:", error);
        }
      }

      // Notify main process to create/get the agent for this session
      try {
        await invoke("setSessionId", sessionId);
      } catch (error) {
        console.error("Failed to set session ID:", error);
      }

      sessionStore.getState().selectSession(sessionId);
      navigate("/");
    },
    [navigate, invoke],
  );

  const renderedSessions = useMemo<SessionSidebarItem[]>(() => {
    const isWorkspaceRoute = location.pathname === "/";

    return storeSessions.slice(0, 50).map((session) => ({
      id: session.id,
      isActive: isWorkspaceRoute && session.id === activeSessionId,
      label: session.name.trim() || "untitled",
      updatedAtLabel: formatRelativeTime(new Date(session.updatedAt)),
      status: session.status,
    }));
  }, [activeSessionId, location.pathname, storeSessions]);

  return {
    handleCreateSession,
    handleOpenSettings,
    handleSelectSession,
    renderedSessions,
  };
}

export function Sessions() {
  const { handleCreateSession, handleOpenSettings, handleSelectSession, renderedSessions } =
    useSessionSidebar();

  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border select-none">
      {/* Top Actions */}
      <div className="flex flex-col px-3 py-4 space-y-[2px]">
        <button
          onClick={handleCreateSession}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground overflow-hidden"
        >
          <SquarePen className="size-4 opacity-70 shrink-0" />
          <span className="truncate">新对话</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        {/* Session Items */}
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

      {/* Bottom Actions */}
      <div className="flex flex-col px-3 py-3 border-t border-sidebar-border space-y-[2px]">
        <button
          onClick={handleOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground overflow-hidden"
        >
          <Settings className="size-4 opacity-70 shrink-0" />
          <span className="truncate">设置</span>
        </button>
      </div>
    </div>
  );
}
