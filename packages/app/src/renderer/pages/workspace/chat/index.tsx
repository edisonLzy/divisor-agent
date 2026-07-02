import { ErrorBoundary } from "@renderer/components/ui/error-boundary";
import { mainStore } from "@renderer/store/main";
import type { ComponentProps } from "react";
import { useStore } from "zustand";

import { ToggleSidebarButton } from "../toggle-sidebar-button";
import { useWindowFullScreen } from "../use-window-full-screen";
import { ActiveSessionContent } from "./active-session-content";
import { PendingSessionContent } from "./pending-session-content";

interface ChatProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: ComponentProps<typeof ToggleSidebarButton>["onToggle"];
}

export function Chat({ isSidebarCollapsed, onToggleSidebar }: ChatProps) {
  const activeSessionId = useStore(mainStore, (state) => state.activeSessionId);
  const shouldRenderPendingState = !activeSessionId;
  const isWindowFullScreen = useWindowFullScreen();
  const insetForWindowControls = isSidebarCollapsed && !isWindowFullScreen;
  const sidebarControl = (
    <ToggleSidebarButton isCollapsed={isSidebarCollapsed} onToggle={onToggleSidebar} />
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden border-l-2 border-border"
      style={{
        background:
          "radial-gradient(circle at 10% 0%, var(--workspace-glow), transparent 40%), var(--workspace-surface)",
      }}
    >
      <ErrorBoundary>
        {shouldRenderPendingState ? (
          <PendingSessionContent
            insetForWindowControls={insetForWindowControls}
            sidebarControl={sidebarControl}
          />
        ) : (
          <ActiveSessionContent
            insetForWindowControls={insetForWindowControls}
            sidebarControl={sidebarControl}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
