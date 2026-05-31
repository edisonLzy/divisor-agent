import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { sessionStore } from "@renderer/store";

/**
 * Subscribes to agent lifecycle events to manage session UI state
 * (loading indicator, status badge, streaming state).
 *
 * Separate from message content handling — focuses purely on
 * session-level visual state.
 */
export function useAgentSessions() {
  useSubscribeAgentEvents({
    agent_start: (event) => {
      const { sessionId } = event;
      sessionStore.getState().setSessionStatus(sessionId, "running");
    },

    agent_end: (event) => {
      const { sessionId } = event;
      sessionStore.getState().setSessionStatus(sessionId, "completed");
    },
  });
}
