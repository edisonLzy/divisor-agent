import { describe, expect, it } from "vitest";

import { createAskUserQuestionTool } from "../../../src/main/tools/ask-user-question-tool.js";
import { UserInteractionService } from "../../../src/main/user-interactions/user-interaction-service.js";

describe("ask_user tool", () => {
  it("returns structured user answers", async () => {
    const service = new UserInteractionService();
    let requestId = "";
    service.setRequestCallback((request) => {
      requestId = request.requestId;
    });
    const tool = createAskUserQuestionTool(service);

    const resultPromise = tool.execute("tool-call-1", {
      questions: [
        {
          id: "contract",
          question: "Which contract?",
          type: "single",
          options: [
            { id: "split", label: "Split" },
            { id: "unified", label: "Unified" },
          ],
        },
      ],
    });

    expect(requestId).not.toBe("");
    service.resolve(requestId, {
      status: "submitted",
      answers: [{ questionId: "contract", selectedOptionIds: ["split"] }],
    });

    const result = await resultPromise;
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[0].type === "text" ? result.content[0].text : "").toContain('"split"');
    expect(result.details).toMatchObject({ status: "submitted" });
  });

  it("reports dismissed requests to the agent", async () => {
    const service = new UserInteractionService();
    let requestId = "";
    service.setRequestCallback((request) => {
      requestId = request.requestId;
    });
    const tool = createAskUserQuestionTool(service);
    const resultPromise = tool.execute("tool-call-2", {
      questions: [{ id: "details", question: "Anything else?", type: "text" }],
    });

    service.resolve(requestId, { status: "dismissed" });

    const result = await resultPromise;
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "User dismissed the questions without answering.",
    });
  });

  it("returns a validation result for duplicate question ids", async () => {
    const tool = createAskUserQuestionTool(new UserInteractionService());

    const result = await tool.execute("tool-call-3", {
      questions: [
        { id: "duplicate", question: "First?", type: "text" },
        { id: "duplicate", question: "Second?", type: "text" },
      ],
    });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Invalid ask_user request: duplicate question id: duplicate",
    });
  });
});
