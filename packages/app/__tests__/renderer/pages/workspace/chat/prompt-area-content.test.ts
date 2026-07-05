import { describe, expect, it } from "vitest";

import { selectPromptAreaContent } from "../../../../../src/renderer/pages/workspace/chat/prompt-area-content.js";

describe("selectPromptAreaContent", () => {
  it("gives permission priority over ask user question", () => {
    expect(selectPromptAreaContent(true, true)).toBe("permission");
  });

  it("shows ask user question when no permission is pending", () => {
    expect(selectPromptAreaContent(false, true)).toBe("ask-user-question");
  });

  it("falls back to prompt input when no request is pending", () => {
    expect(selectPromptAreaContent(false, false)).toBe("prompt-input");
  });
});
