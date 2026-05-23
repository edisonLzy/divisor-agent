import { listSessions } from "@renderer/apis/sessions";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { sessionStore } from "@renderer/store/sessions";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Subscribes to agent lifecycle events to manage session UI state
 * (loading indicator, status badge, streaming state).
 *
 * Separate from message content handling — focuses purely on
 * session-level visual state.
 */
export function useAgentSessions() {
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });

  useEffect(() => {
    if (!sessions) {
      return;
    }

    sessionStore.getState().setSessions(sessions);
  }, [sessions]);

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
