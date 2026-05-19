import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { sessionStore } from "@renderer/store/sessions";

/**
 * Subscribes to agent lifecycle events to manage session UI state
 * (loading indicator, status badge, streaming state).
 *
 * Separate from message content handling — focuses purely on
 * session-level visual state.
 */
export function useSessionsSubscriptions() {
  useSubscribeAgentEvents({
    agent_start: (event) => {
      const { sessionId } = event;
      sessionStore.getState().setLoading(sessionId, true);
      sessionStore.getState().setSessionStatus(sessionId, "running");
    },

    agent_end: (event) => {
      const { sessionId } = event;
      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      if (session.streamingEntryId) {
        sessionStore
          .getState()
          .setMessageCompletedAt(sessionId, session.streamingEntryId, Date.now());
      }

      sessionStore.getState().setLoading(sessionId, false);
      sessionStore.getState().setStreamingEntryId(sessionId, undefined);
      sessionStore.getState().setSessionStatus(sessionId, "completed");
    },
  });
}
