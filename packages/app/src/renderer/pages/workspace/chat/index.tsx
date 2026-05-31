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
      className="flex h-full flex-col rounded-tr-3xl overflow-hidden ring-1 ring-white/8"
      style={{
        background:
          "radial-gradient(circle at 10% 0%, rgba(255,255,255,0.06), transparent 40%), rgba(17,17,17,0.88)",
      }}
    >
      <ErrorBoundary>
        {shouldRenderPendingState ? <PendingSessionContent /> : <ActiveSessionContent />}
      </ErrorBoundary>
    </div>
  );
}
