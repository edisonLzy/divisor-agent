import { describe, expect, it } from "vitest";

import { AskUserQuestionService } from "../../../src/main/human-in-the-loop/ask-user-question-service.js";

describe("AskUserQuestionService", () => {
  it("emits a normalized request and resolves complete answers", async () => {
    const service = new AskUserQuestionService();
    const requestEvent = service.once("human-in-the-loop");

    const resultPromise = service.request(createInput());
    const request = (await requestEvent).data;
    service.resolve(request.requestId, {
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
    expect(request).toMatchObject({ kind: "ask_user_question" });
    expect(request.questions[0]).toMatchObject({ header: "Architecture" });
  });

  it("rejects invalid question counts and incomplete answers", async () => {
    const service = new AskUserQuestionService();
    expect(() => service.request({ questions: [] })).toThrow("between 1 and 3");

    const requestEvent = service.once("human-in-the-loop");
    const resultPromise = service.request(createInput());
    const requestId = (await requestEvent).data.requestId;
    expect(() => service.resolve(requestId, { answers: [] })).toThrow("answer every question");
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
