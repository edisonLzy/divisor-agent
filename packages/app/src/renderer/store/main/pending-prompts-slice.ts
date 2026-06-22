import type { AgentUserMessage } from "@shared/agent-message-ipc";
import type { PendingPrompt } from "@shared/pending-prompts-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export interface SessionPendingPromptsState {
  pendingPrompts: PendingPrompt[];
  pendingMessages: Map<number, AgentUserMessage>;
}

export interface PendingPromptsSlice {
  pendingPromptStates: Map<string, SessionPendingPromptsState>;
  getPendingPromptsState: (sessionId: string) => SessionPendingPromptsState;
  getPendingMessage: (sessionId: string, timestamp: number) => AgentUserMessage | undefined;
  addPendingPrompt: (sessionId: string, pendingPrompt: PendingPrompt) => void;
  updatePendingPrompt: (
    sessionId: string,
    pendingPromptId: string,
    update: {
      message: AgentUserMessage;
      skillIds: string[];
    },
  ) => void;
  removePendingPrompt: (sessionId: string, pendingPromptId: string) => void;
  reorderPendingPrompts: (sessionId: string, sourceIndex: number, targetIndex: number) => void;
  clearPendingPromptsState: (sessionId: string) => void;
}

const EMPTY_PENDING_PROMPTS_STATE: SessionPendingPromptsState = {
  pendingPrompts: [],
  pendingMessages: new Map(),
};

function createEmptyPendingPromptsState(): SessionPendingPromptsState {
  return { pendingPrompts: [], pendingMessages: new Map() };
}

function getStoredPendingPromptsState(
  pendingPromptStates: Map<string, SessionPendingPromptsState>,
  sessionId: string,
) {
  return pendingPromptStates.get(sessionId) ?? createEmptyPendingPromptsState();
}

export const createPendingPromptsSlice: StateCreator<
  MainStoreState,
  [],
  [],
  PendingPromptsSlice
> = (set, get) => ({
  pendingPromptStates: new Map(),

  getPendingPromptsState: (sessionId) => {
    return get().pendingPromptStates.get(sessionId) ?? EMPTY_PENDING_PROMPTS_STATE;
  },

  getPendingMessage: (sessionId, timestamp) => {
    return get().getPendingPromptsState(sessionId).pendingMessages.get(timestamp);
  },

  addPendingPrompt: (sessionId, pendingPrompt) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      const pendingMessages = new Map(existing.pendingMessages);
      pendingMessages.set(pendingPrompt.message.timestamp, pendingPrompt.message);
      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts: [...existing.pendingPrompts, pendingPrompt],
        pendingMessages,
      });
      return { pendingPromptStates };
    });
  },

  updatePendingPrompt: (sessionId, pendingPromptId, update) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      const pendingMessages = new Map(existing.pendingMessages);
      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts: existing.pendingPrompts.map((item) => {
          if (item.id !== pendingPromptId) return item;
          pendingMessages.delete(item.message.timestamp);
          pendingMessages.set(update.message.timestamp, update.message);
          return {
            ...item,
            message: update.message,
            metadata: {
              ...item.metadata,
              skillIds: update.skillIds,
            },
          };
        }),
        pendingMessages,
      });
      return { pendingPromptStates };
    });
  },

  removePendingPrompt: (sessionId, pendingPromptId) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      const pendingMessages = new Map(existing.pendingMessages);
      const pendingPrompt = existing.pendingPrompts.find((item) => item.id === pendingPromptId);
      if (pendingPrompt) {
        pendingMessages.delete(pendingPrompt.message.timestamp);
      }
      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts: existing.pendingPrompts.filter((item) => item.id !== pendingPromptId),
        pendingMessages,
      });
      return { pendingPromptStates };
    });
  },

  reorderPendingPrompts: (sessionId, sourceIndex, targetIndex) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      if (
        sourceIndex === targetIndex ||
        sourceIndex < 0 ||
        targetIndex < 0 ||
        sourceIndex >= existing.pendingPrompts.length ||
        targetIndex >= existing.pendingPrompts.length
      ) {
        return prev;
      }

      const pendingPrompts = [...existing.pendingPrompts];
      const [moved] = pendingPrompts.splice(sourceIndex, 1);
      if (!moved) return prev;
      pendingPrompts.splice(targetIndex, 0, moved);

      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts,
      });
      return { pendingPromptStates };
    });
  },

  clearPendingPromptsState: (sessionId) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      pendingPromptStates.delete(sessionId);
      return { pendingPromptStates };
    });
  },
});
