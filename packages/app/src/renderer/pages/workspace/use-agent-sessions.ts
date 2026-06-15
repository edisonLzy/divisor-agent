import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { isFailedAssistantMessage } from "@renderer/lib/is";
import { mainStore } from "@renderer/store/main";

/**
 * Subscribes to agent lifecycle events to manage session UI state
 * (loading indicator, status badge, streaming state).
 *
 * Separate from message content handling — focuses purely on
 * session-level visual state.
 */
export function useAgentSessions() {
  useSubscribeAgentEvents(
    {
      agent_start: (event) => {
        const { sessionId } = event;
        mainStore.getState().setStatus(sessionId, "running");
      },

      agent_end: (event) => {
        const { sessionId, messages } = event;
        const status = messages.some(isFailedAssistantMessage) ? "failed" : "completed";
        mainStore.getState().setStatus(sessionId, status);
      },
    },
    {
      shouldHandleEvent: (event) => {
        return Boolean(mainStore.getState().getSession(event.sessionId));
      },
    },
  );
}
