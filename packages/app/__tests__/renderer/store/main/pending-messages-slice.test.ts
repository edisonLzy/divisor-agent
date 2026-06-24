import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createPendingMessagesSlice } from "../../../../src/renderer/store/main/pending-messages-slice";
import type { MainStoreState } from "../../../../src/renderer/store/main/store-state";

function createPendingStore() {
  return createStore<MainStoreState>()(
    (...args) =>
      ({
        ...createPendingMessagesSlice(...args),
      }) as MainStoreState,
  );
}

function createMessage(timestamp: number, kind: AppUserMessage["kind"]): AppUserMessage {
  return {
    role: "user",
    content: `${kind}-${timestamp}`,
    timestamp,
    kind,
    jsonContent: { type: "doc" },
  };
}

describe("createPendingMessagesSlice", () => {
  it("appends pending messages for a session", () => {
    const store = createPendingStore();
    const first = createMessage(1, "steering");
    const second = createMessage(2, "follow-up");

    store.getState().addPendingMessage("session-a", first);
    store.getState().addPendingMessage("session-a", second);

    expect(store.getState().getSessionPendingMessages("session-a")).toEqual([first, second]);
  });

  it("removes a message at a valid index and ignores invalid indices", () => {
    const store = createPendingStore();
    const first = createMessage(1, "steering");
    const second = createMessage(2, "follow-up");

    store.getState().addPendingMessage("session-a", first);
    store.getState().addPendingMessage("session-a", second);
    const beforeInvalidRemove = store.getState().getSessionPendingMessages("session-a");

    store.getState().removePendingMessageAt("session-a", 10);
    expect(store.getState().getSessionPendingMessages("session-a")).toBe(beforeInvalidRemove);

    store.getState().removePendingMessageAt("session-a", 0);
    expect(store.getState().getSessionPendingMessages("session-a")).toEqual([second]);
  });

  it("reorders pending messages", () => {
    const store = createPendingStore();
    const first = createMessage(1, "steering");
    const second = createMessage(2, "follow-up");
    const third = createMessage(3, "follow-up");

    store.getState().addPendingMessage("session-a", first);
    store.getState().addPendingMessage("session-a", second);
    store.getState().addPendingMessage("session-a", third);

    store.getState().reorderPendingMessages("session-a", 2, 0);

    expect(store.getState().getSessionPendingMessages("session-a")).toEqual([third, first, second]);
  });

  it("clears a session pending queue", () => {
    const store = createPendingStore();

    store.getState().addPendingMessage("session-a", createMessage(1, "steering"));
    store.getState().clearSessionPendingMessages("session-a");

    expect(store.getState().getSessionPendingMessages("session-a")).toEqual([]);
  });

  it("removes consumed messages by timestamp", () => {
    const store = createPendingStore();
    const first = createMessage(1, "steering");
    const second = createMessage(2, "follow-up");

    store.getState().addPendingMessage("session-a", first);
    store.getState().addPendingMessage("session-a", second);
    store.getState().removePendingMessageByTimestamp("session-a", 1);

    expect(store.getState().getSessionPendingMessages("session-a")).toEqual([second]);
  });
});
