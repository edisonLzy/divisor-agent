import { ErrorBoundary } from "@renderer/components/ui/error-boundary";
import { sessionStore } from "@renderer/store";
import { useStore } from "zustand";

import { ActiveSessionContent } from "./active-session-content";
import { PendingSessionContent } from "./pending-session-content";

export function Chat() {
  const activeSessionId = useStore(sessionStore, (state) => state.activeSessionId);
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
        {shouldRenderPendingState ? <PendingSessionContent /> : <ActiveSessionContent />}
      </ErrorBoundary>
    </div>
  );
}
