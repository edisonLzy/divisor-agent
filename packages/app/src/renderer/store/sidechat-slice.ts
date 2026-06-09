import { isAgentMessageEntry } from "@renderer/lib/is";
import type { AvailableModel } from "@shared/models-ipc";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand/vanilla";

import { EntryStatus } from "./types";
import type {
  AgentMessageData,
  SideChatContext,
  SideChatSession,
  SideChatSlice,
  SideChatState,
  SessionsStoreState,
} from "./types";

const EMPTY_SIDE_CHAT_STATE: SideChatState = {
  sideChats: [],
  activeSideChatId: null,
  isPanelOpen: false,
};

function createSideChatSession(
  id: string,
  name: string,
  model: AvailableModel,
  context: SideChatContext,
): SideChatSession {
  return {
    id,
    name,
    model,
    entries: [],
    status: "idle",
    toolStates: new Map(),
    context,
    createdAt: Date.now(),
  };
}

export const createSideChatSlice: StateCreator<SessionsStoreState, [], [], SideChatSlice> = (
  set,
  get,
) => ({
  sideChatStates: new Map(),
  sideChatToMainMap: new Map(),

  getSideChatState: (mainSessionId) => {
    return get().sideChatStates.get(mainSessionId) ?? EMPTY_SIDE_CHAT_STATE;
  },

  isSideChatSession: (sessionId) => {
    return get().sideChatToMainMap.has(sessionId);
  },

  getMainSessionId: (sideChatId) => {
    return get().sideChatToMainMap.get(sideChatId);
  },

  createSideChat: (mainSessionId, context, model) => {
    const sideChatId = uuidv4();
    const name = context.selectedText.slice(0, 30) + (context.selectedText.length > 30 ? "…" : "");
    const sideChat = createSideChatSession(sideChatId, name, model, context);

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const state = sideChatStates.get(mainSessionId) ?? {
        ...EMPTY_SIDE_CHAT_STATE,
      };
      sideChatStates.set(mainSessionId, {
        sideChats: [...state.sideChats, sideChat],
        activeSideChatId: sideChatId,
        isPanelOpen: true,
      });

      const sideChatToMainMap = new Map(prev.sideChatToMainMap);
      sideChatToMainMap.set(sideChatId, mainSessionId);

      return { sideChatStates, sideChatToMainMap };
    });

    return sideChatId;
  },

  closeSideChat: (mainSessionId, sideChatId) => {
    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const state = sideChatStates.get(mainSessionId);
      if (!state) return prev;

      const sideChats = state.sideChats.filter((sc) => sc.id !== sideChatId);
      const activeSideChatId =
        state.activeSideChatId === sideChatId ? (sideChats[0]?.id ?? null) : state.activeSideChatId;

      sideChatStates.set(mainSessionId, {
        ...state,
        sideChats,
        activeSideChatId,
      });

      const sideChatToMainMap = new Map(prev.sideChatToMainMap);
      sideChatToMainMap.delete(sideChatId);

      return { sideChatStates, sideChatToMainMap };
    });
  },

  setActiveSideChat: (mainSessionId, sideChatId) => {
    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const state = sideChatStates.get(mainSessionId);
      if (!state) return prev;

      sideChatStates.set(mainSessionId, {
        ...state,
        activeSideChatId: sideChatId,
      });
      return { sideChatStates };
    });
  },

  setSideChatPanelOpen: (mainSessionId, isOpen) => {
    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const state = sideChatStates.get(mainSessionId) ?? EMPTY_SIDE_CHAT_STATE;

      sideChatStates.set(mainSessionId, {
        ...state,
        isPanelOpen: isOpen,
      });
      return { sideChatStates };
    });
  },

  // ── Entry/streaming methods ────────────────────────────────────────────────

  appendSideChatEntry: (mainSessionId, sideChatId, message) => {
    const entryId = uuidv4();
    const state = get().sideChatStates.get(mainSessionId);
    if (!state) return entryId;

    const sideChat = state.sideChats.find((sc) => sc.id === sideChatId);
    if (!sideChat) return entryId;

    const parentId =
      sideChat.entries.length > 0 ? sideChat.entries[sideChat.entries.length - 1].id : null;

    const messageEntry = {
      id: entryId,
      sessionId: sideChatId,
      parentId,
      type: "message" as const,
      timestamp: Date.now(),
      data: message,
      status: EntryStatus.Local,
    };

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const currentState = sideChatStates.get(mainSessionId);
      if (!currentState) return prev;

      const sideChats = currentState.sideChats.map((sc) => {
        if (sc.id !== sideChatId) return sc;
        return { ...sc, entries: [...sc.entries, messageEntry] };
      });

      sideChatStates.set(mainSessionId, { ...currentState, sideChats });
      return { sideChatStates };
    });

    return entryId;
  },

  updateSideChatEntry: (mainSessionId, sideChatId, entryId, message) => {
    const state = get().sideChatStates.get(mainSessionId);
    if (!state) return;

    const sideChat = state.sideChats.find((sc) => sc.id === sideChatId);
    if (!sideChat) return;

    const entryIndex = sideChat.entries.findIndex((e) => e.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = sideChat.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry) || existingEntry.data.role !== "assistant") return;

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const currentState = sideChatStates.get(mainSessionId);
      if (!currentState) return prev;

      const entries = [...sideChat.entries];
      entries[entryIndex] = { ...existingEntry, data: message as AgentMessageData };

      const sideChats = currentState.sideChats.map((sc) => {
        if (sc.id !== sideChatId) return sc;
        return { ...sc, entries };
      });

      sideChatStates.set(mainSessionId, { ...currentState, sideChats });
      return { sideChatStates };
    });
  },

  setSideChatToolState: (mainSessionId, sideChatId, toolCallId, toolState) => {
    const state = get().sideChatStates.get(mainSessionId);
    if (!state) return;

    const sideChat = state.sideChats.find((sc) => sc.id === sideChatId);
    if (!sideChat) return;

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const currentState = sideChatStates.get(mainSessionId);
      if (!currentState) return prev;

      const toolStates = new Map(sideChat.toolStates);
      toolStates.set(toolCallId, toolState);

      const sideChats = currentState.sideChats.map((sc) => {
        if (sc.id !== sideChatId) return sc;
        return { ...sc, toolStates };
      });

      sideChatStates.set(mainSessionId, { ...currentState, sideChats });
      return { sideChatStates };
    });
  },

  setSideChatStatus: (mainSessionId, sideChatId, status) => {
    const state = get().sideChatStates.get(mainSessionId);
    if (!state) return;

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const currentState = sideChatStates.get(mainSessionId);
      if (!currentState) return prev;

      const sideChats = currentState.sideChats.map((sc) => {
        if (sc.id !== sideChatId) return sc;
        return { ...sc, status };
      });

      sideChatStates.set(mainSessionId, { ...currentState, sideChats });
      return { sideChatStates };
    });
  },

  setSideChatStreamingEntryId: (_mainSessionId, sideChatId, entryId) => {
    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);

      // Store streaming entry id keyed by sideChatId
      const streamingEntryIds = new Map(prev.streamingEntryIds);
      if (entryId === undefined) {
        streamingEntryIds.delete(sideChatId);
      } else {
        streamingEntryIds.set(sideChatId, entryId);
      }

      return { sideChatStates, streamingEntryIds };
    });
  },

  setSideChatStreamingCompletedAt: (mainSessionId, sideChatId) => {
    const entryId = get().streamingEntryIds.get(sideChatId);
    if (!entryId) return;

    const state = get().sideChatStates.get(mainSessionId);
    if (!state) return;

    const sideChat = state.sideChats.find((sc) => sc.id === sideChatId);
    if (!sideChat) return;

    const entryIndex = sideChat.entries.findIndex((e) => e.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = sideChat.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) return;

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      const currentState = sideChatStates.get(mainSessionId);
      if (!currentState) return prev;

      const entries = [...sideChat.entries];
      entries[entryIndex] = { ...existingEntry, completedAt: Date.now() };

      const sideChats = currentState.sideChats.map((sc) => {
        if (sc.id !== sideChatId) return sc;
        return { ...sc, entries };
      });

      sideChatStates.set(mainSessionId, { ...currentState, sideChats });
      return { sideChatStates };
    });
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  destroySideChatsForSession: (mainSessionId, destroyRuntime) => {
    const state = get().sideChatStates.get(mainSessionId);
    if (!state) return;

    for (const sideChat of state.sideChats) {
      destroyRuntime(sideChat.id);
    }

    set((prev) => {
      const sideChatStates = new Map(prev.sideChatStates);
      sideChatStates.delete(mainSessionId);

      const sideChatToMainMap = new Map(prev.sideChatToMainMap);
      for (const sideChat of state.sideChats) {
        sideChatToMainMap.delete(sideChat.id);
      }

      return { sideChatStates, sideChatToMainMap };
    });
  },
});
