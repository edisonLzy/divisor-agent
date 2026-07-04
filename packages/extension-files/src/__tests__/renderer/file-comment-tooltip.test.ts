import { describe, expect, it } from "vitest";

import {
  getFileCommentTooltipContent,
  type FileCommentNodeAttrs,
} from "../../renderer/file-comment-extension/model";

describe("file comment tooltip content", () => {
  it("combines the selected code and comment body", () => {
    expect(getFileCommentTooltipContent(createAttrs())).toEqual({
      meta: "packages/app/src/session-item.tsx",
      preview: "const menu = open();\n\nFix the hover offset",
      range: "L12",
      title: "代码注释",
    });
  });

  it("formats a multiline range", () => {
    expect(getFileCommentTooltipContent(createAttrs({ endLine: 15 })).range).toBe("L12-15");
  });

  it("shows either available detail without blank separators", () => {
    expect(getFileCommentTooltipContent(createAttrs({ body: "" })).preview).toBe(
      "const menu = open();",
    );
    expect(getFileCommentTooltipContent(createAttrs({ selectedText: "" })).preview).toBe(
      "Fix the hover offset",
    );
  });

  it("provides an explicit empty state", () => {
    expect(
      getFileCommentTooltipContent(createAttrs({ body: "  ", selectedText: "  " })).preview,
    ).toBe("暂无注释内容");
  });
});

function createAttrs(overrides: Partial<FileCommentNodeAttrs> = {}): FileCommentNodeAttrs {
  return {
    body: "Fix the hover offset",
    commentId: "comment-1",
    endColumn: 20,
    endLine: 12,
    filePath: "packages/app/src/session-item.tsx",
    selectedText: "const menu = open();",
    startColumn: 1,
    startLine: 12,
    ...overrides,
  };
}
