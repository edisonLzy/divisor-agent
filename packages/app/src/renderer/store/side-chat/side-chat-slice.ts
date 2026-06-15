import type { AvailableModel } from "@shared/models-ipc";
import type { StateCreator } from "zustand/vanilla";

import type { SideChatStoreState } from ".";
import type { ArtifactRecord } from "../main/artifact-slice";

export type SideChatContext = Record<string, unknown>;

export interface SideChatMeta {
  mainSessionId: string;
  context: SideChatContext;
  model?: Pick<AvailableModel, "modelId" | "providerId">;
  pendingPrompt: string;
  createdAt: number;
  inputDisabled?: boolean;
  kind?: "side-chat" | "subagent";
}

export interface SideChatArtifactContent extends Record<string, unknown> {
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
    model: Pick<AvailableModel, "modelId" | "providerId"> | undefined,
    pendingPrompt: string,
    options?: { inputDisabled?: boolean; kind?: "side-chat" | "subagent" },
  ) => void;
  setSideChatModel: (
    sideChatId: string,
    model: Pick<AvailableModel, "modelId" | "providerId">,
  ) => void;
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

  initSideChat: (sideChatId, mainSessionId, context, model, pendingPrompt, options = {}) => {
    set((prev) => {
      const sideChatMeta = new Map(prev.sideChatMeta);
      sideChatMeta.set(sideChatId, {
        mainSessionId,
        context,
        model,
        pendingPrompt,
        createdAt: Date.now(),
        inputDisabled: options.inputDisabled,
        kind: options.kind ?? "side-chat",
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
