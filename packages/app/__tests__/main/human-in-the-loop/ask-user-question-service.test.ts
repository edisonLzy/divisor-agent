import { describe, expect, it } from "vitest";

import { AskUserQuestionService } from "../../../src/main/human-in-the-loop/ask-user-question-service.js";

describe("AskUserQuestionService", () => {
  it("emits a normalized request and resolves complete answers", async () => {
    const service = new AskUserQuestionService();
    const requestEvent = service.once("human-in-the-loop");

    const resultPromise = service.requestForSession("session-1", "main", createInput());
    const request = (await requestEvent).data;
    service.resolveForSession("session-1", request.requestId, {
      answers: [{ question: "Which approach?", selectedOptions: ["Shared core"] }],
      additionalNote: "Keep it small.",
    });

    await expect(resultPromise).resolves.toEqual({
      answers: [
        {
          question: "Which approach?",
          selectedOptions: ["Shared core"],
          customAnswer: undefined,
        },
      ],
      additionalNote: "Keep it small.",
    });
    expect(request.payload).toMatchObject({ sessionId: "session-1", scope: "main" });
  });

  it("rejects invalid question counts and incomplete answers", async () => {
    const service = new AskUserQuestionService();
    expect(() => service.requestForSession("session-1", "main", { questions: [] })).toThrow(
      "between 1 and 3",
    );

    const requestEvent = service.once("human-in-the-loop");
    const resultPromise = service.requestForSession("session-1", "main", createInput());
    const requestId = (await requestEvent).data.requestId;
    expect(() => service.resolveForSession("session-1", requestId, { answers: [] })).toThrow(
      "answer every question",
    );
    service.cancelAll("test complete");
    await expect(resultPromise).rejects.toThrow("test complete");
  });
});

function createInput() {
  return {
    questions: [
      {
        header: "Architecture",
        question: "Which approach?",
        options: [
          { label: "Shared core", description: "Reuse lifecycle behavior." },
          { label: "Separate", description: "Keep implementations isolated." },
        ],
      },
    ],
  };
}
