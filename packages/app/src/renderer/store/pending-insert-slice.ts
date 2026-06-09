import type { StateCreator } from "zustand/vanilla";

import type { PendingInsertSlice, SessionsStoreState } from "./types";

export const createPendingInsertSlice: StateCreator<
  SessionsStoreState,
  [],
  [],
  PendingInsertSlice
> = (set) => ({
  pendingInsertText: new Map(),

  setPendingInsertText: (sessionId, text) => {
    set((prev) => {
      const pendingInsertText = new Map(prev.pendingInsertText);
      if (text === null) {
        pendingInsertText.delete(sessionId);
      } else {
        pendingInsertText.set(sessionId, text);
      }
      return { pendingInsertText };
    });
  },
});
