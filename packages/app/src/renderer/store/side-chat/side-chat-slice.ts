import type { StateCreator } from "zustand/vanilla";

import type { SideChatSlice, SideChatStoreState } from "../types";

export const createSideChatSlice: StateCreator<SideChatStoreState, [], [], SideChatSlice> = (
  set,
  get,
) => ({
  sideChatMeta: new Map(),

  getSideChatMeta: (sideChatId) => {
    return get().sideChatMeta.get(sideChatId);
  },

  isSideChatSession: (sessionId) => {
    return get().sideChatMeta.has(sessionId);
  },

  initSideChat: (sideChatId, mainSessionId, context, model, pendingPrompt) => {
    set((prev) => {
      const sideChatMeta = new Map(prev.sideChatMeta);
      sideChatMeta.set(sideChatId, {
        mainSessionId,
        context,
        model,
        pendingPrompt,
        createdAt: Date.now(),
      });
      return { sideChatMeta };
    });
  },

  setSideChatModel: (sideChatId, model) => {
    const meta = get().sideChatMeta.get(sideChatId);
    if (!meta) return;

    set((prev) => {
      const sideChatMeta = new Map(prev.sideChatMeta);
      sideChatMeta.set(sideChatId, { ...meta, model });
      return { sideChatMeta };
    });
  },

  removeSideChatMeta: (sideChatId) => {
    set((prev) => {
      const sideChatMeta = new Map(prev.sideChatMeta);
      sideChatMeta.delete(sideChatId);
      return { sideChatMeta };
    });
  },
});
