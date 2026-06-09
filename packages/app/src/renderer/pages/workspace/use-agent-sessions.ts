import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { isFailedAssistantMessage } from "@renderer/lib/is";
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
      // Side chat sessions manage their own status
      if (sessionStore.getState().isSideChatSession(sessionId)) return;
      sessionStore.getState().setSessionStatus(sessionId, "running");
    },

    agent_end: (event) => {
      const { sessionId, messages } = event;
      // Side chat sessions manage their own status
      if (sessionStore.getState().isSideChatSession(sessionId)) return;
      const status = messages.some(isFailedAssistantMessage) ? "failed" : "completed";
      sessionStore.getState().setSessionStatus(sessionId, status);
    },
  });
}
