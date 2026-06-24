import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import type { StateCreator } from "zustand/vanilla";

import type { MainStoreState } from "./store-state";

/**
 * Renderer-side queue of pending steer / follow-up messages.
 *
 * Each entry is a full `AppUserMessage` — the `kind` field ("steering" | "follow-up")
 * carries the semantic and is read directly by the panel for display and by
 * `use-agent-messages` for branch dispatch on consumption.
 *
 * The store does not own the agent-side queue (pi-agent-core's `agent.steer()` /
 * `agent.followUp()` is the source of truth for execution). This slice mirrors
 * what's been enqueued in the renderer for UI display and removal.
 */
export interface PendingMessagesSlice {
  pendingMessages: Map<string, AppUserMessage[]>;

  getSessionPendingMessages: (sessionId: string) => AppUserMessage[];
  addPendingMessage: (sessionId: string, message: AppUserMessage) => void;
  removePendingMessageByTimestamp: (sessionId: string, timestamp: number) => void;
  removePendingMessageAt: (sessionId: string, index: number) => void;
  reorderPendingMessages: (sessionId: string, fromIndex: number, toIndex: number) => void;
  clearSessionPendingMessages: (sessionId: string) => void;
}

const EMPTY_PENDING: AppUserMessage[] = [];

export const createPendingMessagesSlice: StateCreator<
  MainStoreState,
  [],
  [],
  PendingMessagesSlice
> = (set, get) => ({
  pendingMessages: new Map(),

  getSessionPendingMessages: (sessionId) => {
    return get().pendingMessages.get(sessionId) ?? EMPTY_PENDING;
  },

  addPendingMessage: (sessionId, message) => {
    set((prev) => {
      const next = new Map(prev.pendingMessages);
      const list = next.get(sessionId) ?? [];
      next.set(sessionId, [...list, message]);
      return { pendingMessages: next };
    });
  },

  removePendingMessageByTimestamp: (sessionId, timestamp) => {
    set((prev) => {
      const list = prev.pendingMessages.get(sessionId);
      if (!list) return prev;
      const filtered = list.filter((m) => m.timestamp !== timestamp);
      if (filtered.length === list.length) return prev;
      const next = new Map(prev.pendingMessages);
      if (filtered.length === 0) {
        next.delete(sessionId);
      } else {
        next.set(sessionId, filtered);
      }
      return { pendingMessages: next };
    });
  },

  removePendingMessageAt: (sessionId, index) => {
    set((prev) => {
      const list = prev.pendingMessages.get(sessionId);
      if (!list) return prev;
      if (index < 0 || index >= list.length) return prev;
      const next = new Map(prev.pendingMessages);
      const filtered = list.filter((_, i) => i !== index);
      if (filtered.length === 0) {
        next.delete(sessionId);
      } else {
        next.set(sessionId, filtered);
      }
      return { pendingMessages: next };
    });
  },

  reorderPendingMessages: (sessionId, fromIndex, toIndex) => {
    set((prev) => {
      const list = prev.pendingMessages.get(sessionId);
      if (!list) return prev;
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || toIndex < 0) return prev;
      if (fromIndex >= list.length || toIndex >= list.length) return prev;
      const nextList = [...list];
      const [moved] = nextList.splice(fromIndex, 1);
      if (!moved) return prev;
      nextList.splice(toIndex, 0, moved);
      const out = new Map(prev.pendingMessages);
      out.set(sessionId, nextList);
      return { pendingMessages: out };
    });
  },

  clearSessionPendingMessages: (sessionId) => {
    set((prev) => {
      if (!prev.pendingMessages.has(sessionId)) return prev;
      const next = new Map(prev.pendingMessages);
      next.delete(sessionId);
      return { pendingMessages: next };
    });
  },
});
