import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import {
  createUserInteractionSlice,
  type UserInteractionSlice,
} from "../../../src/renderer/store/user-interaction-slice.js";

describe("UserInteractionSlice", () => {
  it("queues interactions per session and resolves them FIFO", () => {
    const store = createStore<UserInteractionSlice>()((...args) =>
      createUserInteractionSlice<UserInteractionSlice>(...args),
    );

    store.getState().enqueueUserInteraction("main", createRequest("request-1"));
    store.getState().enqueueUserInteraction("main", createRequest("request-2"));
    store.getState().enqueueUserInteraction("side", createRequest("request-3"));

    expect(store.getState().getUserInteractionState("main").requests).toHaveLength(2);
    expect(store.getState().getUserInteractionState("side").requests).toHaveLength(1);

    store.getState().resolveUserInteraction("main", "request-1", { status: "dismissed" });
    expect(store.getState().getUserInteractionState("main").requests[0].requestId).toBe(
      "request-2",
    );
    expect(store.getState().getUserInteractionState("side").requests[0].requestId).toBe(
      "request-3",
    );
  });

  it("deduplicates requests and clears session state", () => {
    const store = createStore<UserInteractionSlice>()((...args) =>
      createUserInteractionSlice<UserInteractionSlice>(...args),
    );
    const request = createRequest("request-1");

    store.getState().enqueueUserInteraction("main", request);
    store.getState().enqueueUserInteraction("main", request);
    expect(store.getState().getUserInteractionState("main").requests).toHaveLength(1);

    store.getState().clearUserInteractionState("main");
    expect(store.getState().getUserInteractionState("main").requests).toHaveLength(0);
  });
});

function createRequest(requestId: string) {
  return {
    requestId,
    source: "ask_user" as const,
    questions: [{ id: "question", question: "Choose", type: "text" as const }],
    createdAt: 1,
  };
}
