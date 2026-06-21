import type { PendingPrompt } from "@shared/pending-prompts-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

export interface SessionPendingPromptsState {
  pendingPrompts: PendingPrompt[];
}

export interface PendingPromptsSlice {
  pendingPromptStates: Map<string, SessionPendingPromptsState>;
  getPendingPromptsState: (sessionId: string) => SessionPendingPromptsState;
  addPendingPrompt: (sessionId: string, pendingPrompt: PendingPrompt) => void;
  removePendingPrompt: (sessionId: string, pendingPromptId: string) => void;
  removeConsumedPendingPrompt: (sessionId: string, content: string, createdAt: number) => void;
  reorderPendingPrompts: (sessionId: string, sourceIndex: number, targetIndex: number) => void;
  clearPendingPromptsState: (sessionId: string) => void;
}

const EMPTY_PENDING_PROMPTS_STATE: SessionPendingPromptsState = {
  pendingPrompts: [],
};

function createEmptyPendingPromptsState(): SessionPendingPromptsState {
  return { pendingPrompts: [] };
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

  addPendingPrompt: (sessionId, pendingPrompt) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts: [...existing.pendingPrompts, pendingPrompt],
      });
      return { pendingPromptStates };
    });
  },

  removePendingPrompt: (sessionId, pendingPromptId) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts: existing.pendingPrompts.filter((item) => item.id !== pendingPromptId),
      });
      return { pendingPromptStates };
    });
  },

  removeConsumedPendingPrompt: (sessionId, content, createdAt) => {
    set((prev) => {
      const pendingPromptStates = new Map(prev.pendingPromptStates);
      const existing = getStoredPendingPromptsState(pendingPromptStates, sessionId);
      const consumedIndex = existing.pendingPrompts.findIndex((item) => {
        return item.createdAt === createdAt || item.content === content;
      });

      if (consumedIndex < 0) {
        return prev;
      }

      pendingPromptStates.set(sessionId, {
        ...existing,
        pendingPrompts: existing.pendingPrompts.filter((_, index) => index !== consumedIndex),
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
