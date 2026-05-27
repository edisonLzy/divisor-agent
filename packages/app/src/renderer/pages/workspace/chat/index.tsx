import { ErrorBoundary } from "@renderer/components/ui/error-boundary";
import { sessionStore } from "@renderer/store/sessions";
import { useStore } from "zustand";

import { ActiveSessionContent } from "./active-session-content";
import { PendingSessionContent } from "./pending-session-content";

export function Chat() {
  const activeSessionId = useStore(sessionStore, (state) => state.activeSessionId);
  const shouldRenderPendingState = !activeSessionId;

  return (
    <div className="flex h-full flex-col bg-background">
      <ErrorBoundary>
        {shouldRenderPendingState ? <PendingSessionContent /> : <ActiveSessionContent />}
      </ErrorBoundary>
    </div>
  );
}
