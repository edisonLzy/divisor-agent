import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { createAskUserQuestionSlice } from "../../../../src/renderer/store/main/ask-user-question-slice.js";
import type { MainStoreState } from "../../../../src/renderer/store/main/store-state.js";

function createAskStore() {
  return createStore<MainStoreState>()(
    (...args) => ({ ...createAskUserQuestionSlice(...args) }) as MainStoreState,
  );
}

describe("ask user question slice", () => {
  it("queues requests per session in arrival order", () => {
    const store = createAskStore();
    store.getState().enqueueAskUserQuestionRequest("session-a", createRequest("ask-1", 1));
    store.getState().enqueueAskUserQuestionRequest("session-a", createRequest("ask-2", 2));
    store.getState().enqueueAskUserQuestionRequest("session-b", createRequest("ask-3", 3));

    expect(
      store
        .getState()
        .getAskUserQuestionState("session-a")
        .requests.map((request) => request.requestId),
    ).toEqual(["ask-1", "ask-2"]);
    expect(store.getState().getAskUserQuestionState("session-b").requests).toHaveLength(1);
  });

  it("removes the resolved request and records its resolution", () => {
    const store = createAskStore();
    store.getState().enqueueAskUserQuestionRequest("session-a", createRequest("ask-1", 1));
    store.getState().resolveAskUserQuestionRequest("session-a", "ask-1", {
      answers: [{ question: "Which scope?", selectedOptions: ["Focused"] }],
    });

    const state = store.getState().getAskUserQuestionState("session-a");
    expect(state.requests).toEqual([]);
    expect(state.lastResolvedRequest?.requestId).toBe("ask-1");
  });
});

function createRequest(requestId: string, createdAt: number) {
  return {
    kind: "ask_user_question" as const,
    requestId,
    createdAt,
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
  };
}
