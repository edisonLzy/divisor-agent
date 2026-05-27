import { createSession } from "@renderer/apis/sessions";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { sessionStore } from "@renderer/store/sessions";
import { useCallback } from "react";

import { useInvalidateStandaloneSessions } from "./sessions/use-standalone-sessions";
import { useInvalidateWorkspaceSessions } from "./sessions/use-workspaces";

/**
 * Hook that returns handlers for session creation lifecycle.
 *
 * - `handleCreateSession`: creates or activates a pending session in the store.
 * - `handleSubmitPrompt`: if a pending session exists, creates the real server-side
 *   session and migrates state. Returns `true` if pending was handled, `false` otherwise.
 */
export function useCreateSession() {
  const { invoke } = useElectronIPC();
  const invalidateStandalone = useInvalidateStandaloneSessions();
  const invalidateWorkspaceSessions = useInvalidateWorkspaceSessions();

  const handleCreateSession = useCallback((workspaceId?: string | null) => {
    const store = sessionStore.getState();
    store.setActiveSessionId(null);

    if (store.pendingSession) {
      return;
    }
    // Create a new pending session
    store.createPendingSession(workspaceId);
  }, []);

  /**
   * Handles the pending → real session transition on first prompt submission.
   *
   * Returns `true` if a pending session was successfully promoted to a real
   * server-side session. Returns `false` if there was no pending session or
   * the creation failed (pendingSession is preserved for retry).
   */
  const handleSubmitPrompt = useCallback(async (): Promise<boolean> => {
    const store = sessionStore.getState();
    const pending = store.pendingSession;
    if (!pending) return false;

    try {
      const newSession = await createSession({
        name: "新对话",
        workspaceId: pending.workspaceId,
        parentSessionId: null,
      });

      store.addSessions([newSession]);
      store.setActiveSessionId(newSession.id);
      store.clearPendingSession();

      await invoke("setSessionId", newSession.id);

      // Refresh the corresponding session list in the sidebar
      if (pending.workspaceId) {
        await invalidateWorkspaceSessions(pending.workspaceId);
      } else {
        await invalidateStandalone();
      }

      return true;
    } catch (error) {
      console.error("Failed to create session for pending:", error);
      // Leave pendingSession intact so user can retry
      return false;
    }
  }, [invoke, invalidateStandalone, invalidateWorkspaceSessions]);

  return { handleCreateSession, handleSubmitPrompt };
}
