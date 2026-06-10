import type { Session } from "@renderer/apis/sessions";
import type { StateCreator } from "zustand/vanilla";

import type { AgentPendingSession, AgentSession, MainStoreState, SessionsSlice } from "../types";

const PENDING_SESSION_SYMBOL = Symbol("pending-session");

function createSessionState(session: Session): AgentSession {
  return {
    ...session,
    model: undefined,
  };
}

export const createSessionsSlice: StateCreator<MainStoreState, [], [], SessionsSlice> = (
  set,
  get,
) => ({
  activeSessionId: null,
  pendingSession: null,
  sessions: [],

  getSession: (sessionId) => {
    return get().sessions.find((session) => session.id === sessionId);
  },

  appendSession: (session) => {
    const existing = get().sessions.find((candidate) => candidate.id === session.id);
    if (existing) return;

    set((prev) => ({ sessions: [...prev.sessions, createSessionState(session)] }));
  },

  setActiveSessionId: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  createPendingSession: (workspaceId) => {
    const pending: AgentPendingSession = {
      id: PENDING_SESSION_SYMBOL,
      workspaceId: workspaceId ?? null,
      createdAt: Date.now(),
    };

    set({ pendingSession: pending, activeSessionId: null });
    return pending;
  },

  clearPendingSession: () => {
    set({ pendingSession: null });
  },

  removeSession: (sessionId) => {
    set((prev) => {
      const sessions = prev.sessions.filter((session) => session.id !== sessionId);
      const activeSessionId = prev.activeSessionId === sessionId ? null : prev.activeSessionId;
      const streamingEntryIds = new Map(prev.streamingEntryIds);
      const permissionStates = new Map(prev.permissionStates);
      const artifactStates = new Map(prev.artifactStates);
      const entryStates = new Map(prev.entryStates);

      streamingEntryIds.delete(sessionId);
      permissionStates.delete(sessionId);
      artifactStates.delete(sessionId);
      entryStates.delete(sessionId);

      return {
        sessions,
        activeSessionId,
        streamingEntryIds,
        permissionStates,
        artifactStates,
        entryStates,
      };
    });
  },

  addSessions: (sessions) => {
    set((prev) => {
      const existingIds = new Set(prev.sessions.map((session) => session.id));
      const nextSessions = sessions
        .filter((session) => !existingIds.has(session.id))
        .map((session) => createSessionState(session));

      if (nextSessions.length === 0) return prev;

      return { sessions: [...prev.sessions, ...nextSessions] };
    });
  },

  setModel: (sessionId, model) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) return prev;

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, model };
      return { sessions };
    });
  },

  setCwd: (sessionId, cwd) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) return prev;

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, cwd };
      return { sessions };
    });
  },
});
