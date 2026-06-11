import type { AvailableModel } from "@shared/models-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { ArtifactRecord } from "../main/artifact-slice";
import type { SideChatStoreState } from "./store-state";

export interface SideChatContext {
  sourceEntryId: string;
  selectedText: string;
}

export interface SideChatMeta {
  mainSessionId: string;
  context: SideChatContext;
  model?: AvailableModel;
  pendingPrompt: string;
  createdAt: number;
}

export interface SideChatArtifactContent {
  // Kept for ArtifactRecord<TContent> compatibility.
}

export type SideChatArtifactRecord = ArtifactRecord<SideChatArtifactContent> & {
  type: "side-chat";
};

export interface SideChatSlice {
  sideChatMeta: Map<string, SideChatMeta>;

  getSideChatMeta: (sideChatId: string) => SideChatMeta | undefined;
  isSideChatSession: (sessionId: string) => boolean;
  initSideChat: (
    sideChatId: string,
    mainSessionId: string,
    context: SideChatContext,
    model: AvailableModel | undefined,
    pendingPrompt: string,
  ) => void;
  setSideChatModel: (sideChatId: string, model: AvailableModel) => void;
  removeSideChatMeta: (sideChatId: string) => void;
}

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
