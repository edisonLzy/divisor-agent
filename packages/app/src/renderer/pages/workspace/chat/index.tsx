import { ErrorBoundary } from "@renderer/components/ui/error-boundary";
import { mainStore } from "@renderer/store/main";
import { useStore } from "zustand";

import { ActiveSessionContent } from "./active-session-content";
import { PendingSessionContent } from "./pending-session-content";

interface ChatProps {
  isSidebarCollapsed: boolean;
}

export function Chat({ isSidebarCollapsed }: ChatProps) {
  const activeSessionId = useStore(mainStore, (state) => state.activeSessionId);
  const shouldRenderPendingState = !activeSessionId;

  return (
    <div
      className="-ml-px flex h-full flex-col overflow-hidden rounded-l-[20px] border border-border/70 border-l-0 supports-backdrop-filter:backdrop-blur-xl"
      style={{
        background:
          "radial-gradient(circle at 10% 0%, var(--workspace-glow), transparent 40%), var(--workspace-surface)",
      }}
    >
      <ErrorBoundary>
        {shouldRenderPendingState ? (
          <PendingSessionContent isSidebarCollapsed={isSidebarCollapsed} />
        ) : (
          <ActiveSessionContent isSidebarCollapsed={isSidebarCollapsed} />
        )}
      </ErrorBoundary>
    </div>
  );
}
