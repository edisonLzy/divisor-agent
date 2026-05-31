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
      className="flex h-full flex-col overflow-hidden rounded-tr-3xl ring-1 ring-border/70 supports-backdrop-filter:backdrop-blur-xl"
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
