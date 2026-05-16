import { cn } from "@renderer/lib/utils";
import { Settings, SquarePen } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useWorkspaceSession } from "../session-provider";

interface SessionSidebarItem {
  id: string;
  isActive: boolean;
  label: string;
  updatedAtLabel: string;
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

function useSessionSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSessionId, createSession, selectSession, sessions } = useWorkspaceSession();

  const handleCreateSession = useCallback(() => {
    void createSession();
  }, [createSession]);

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      void selectSession(sessionId);
      navigate("/");
    },
    [navigate, selectSession],
  );

  const renderedSessions = useMemo<SessionSidebarItem[]>(() => {
    const isWorkspaceRoute = location.pathname === "/";

    return sessions.slice(0, 50).map((session) => {
      return {
        id: session.id,
        isActive: isWorkspaceRoute && session.id === activeSessionId,
        label: session.name.trim() || "untitled",
        updatedAtLabel: formatRelativeTime(session.updatedAt),
      };
    });
  }, [activeSessionId, location.pathname, sessions]);

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
    <div className="flex h-full w-[260px] flex-col bg-sidebar border-r border-sidebar-border select-none">
      {/* Top Actions */}
      <div className="flex flex-col px-3 py-4 space-y-[2px]">
        <button
          onClick={handleCreateSession}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <SquarePen className="size-4 opacity-70" />
          <span>新对话</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        {/* Session Items */}
        <div className="flex flex-col px-1">
          {renderedSessions.length === 0 ? (
            <div className="px-2 py-2 text-[13px] text-muted-foreground/40">暂无对话</div>
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
                  <span className="truncate pr-4">{session.label}</span>
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

      {/* Settings Bottom */}
      <div className="mt-auto px-3 py-3 border-sidebar-border">
        <button
          onClick={handleOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings className="size-4 opacity-70" />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
}
