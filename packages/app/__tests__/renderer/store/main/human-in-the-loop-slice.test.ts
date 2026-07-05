import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createHumanInTheLoopSlice } from "../../../../src/renderer/store/main/human-in-the-loop-slice.js";
import type { MainStoreState } from "../../../../src/renderer/store/main/store-state.js";

function createHumanInTheLoopStore() {
  return createStore<MainStoreState>()(
    (...args) => ({ ...createHumanInTheLoopSlice(...args) }) as MainStoreState,
  );
}

describe("human-in-the-loop slice", () => {
  it("queues permission and ask requests in arrival order", () => {
    const store = createHumanInTheLoopStore();
    store.getState().enqueueHumanInTheLoopRequest("session-a", {
      kind: "permission",
      requestId: "permission-1",
      toolCallId: "tool-1",
      toolName: "terminal/create",
      toolLabel: "Terminal",
      operation: "terminal/create",
      args: { command: "pnpm test" },
      createdAt: 1,
    });
    store.getState().enqueueHumanInTheLoopRequest("session-a", {
      kind: "ask_user_question",
      requestId: "ask-1",
      createdAt: 2,
      questions: [
        {
          header: "Scope",
          question: "Which scope?",
          options: [
            { label: "Focused", description: "Only this module." },
            { label: "Broad", description: "All related modules." },
          ],
        },
      ],
    });

    expect(
      store
        .getState()
        .getHumanInTheLoopState("session-a")
        .requests.map((request) => request.kind),
    ).toEqual(["permission", "ask_user_question"]);
  });

  it("removes only the resolved request", () => {
    const store = createHumanInTheLoopStore();
    store.getState().enqueueHumanInTheLoopRequest("session-a", {
      kind: "ask_user_question",
      requestId: "ask-1",
      createdAt: 1,
      questions: [
        {
          header: "Scope",
          question: "Which scope?",
          options: [
            { label: "Focused", description: "Only this module." },
            { label: "Broad", description: "All related modules." },
          ],
        },
      ],
    });
    store.getState().resolveHumanInTheLoopRequest("session-a", "ask-1", {
      answers: [{ question: "Which scope?", selectedOptions: ["Focused"] }],
    });

    const state = store.getState().getHumanInTheLoopState("session-a");
    expect(state.requests).toEqual([]);
    expect(state.lastResolvedRequest?.requestId).toBe("ask-1");
  });
});
