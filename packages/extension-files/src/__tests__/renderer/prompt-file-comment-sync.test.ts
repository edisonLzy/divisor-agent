import { describe, expect, it } from "vitest";

import {
  createFileCommentNodeAttrs,
  serializeFileCommentNodeToXml,
} from "../../renderer/file-comment-extension";
import { diffFileCommentPromptSync } from "../../renderer/file-comment-extension";
import type { FileComment } from "../../renderer/files-artifact/types";

const FILE_PATH = "packages/app/src/renderer/pages/workspace/chat/messages/user-message.tsx";

describe("prompt file comment sync", () => {
  it("serializes file comments as escaped XML", () => {
    const attrs = createFileCommentNodeAttrs(
      FILE_PATH,
      createComment({
        body: 'Fix "<menu>" & keep hover state',
        id: 'comment-"1"&<2>',
        range: {
          selectedText: 'const label = "<hover>";',
        },
      }),
    );

    expect(serializeFileCommentNodeToXml(attrs)).toBe(
      '<file-comment id="comment-&quot;1&quot;&amp;&lt;2&gt;" path="packages/app/src/renderer/pages/workspace/chat/messages/user-message.tsx" start-line="12" start-column="3" end-line="14" end-column="7"><body>Fix "&lt;menu&gt;" &amp; keep hover state</body><selection>const label = "&lt;hover&gt;";</selection></file-comment>',
    );
  });

  it("ignores newly-created empty comments", () => {
    const operations = diffFileCommentPromptSync(FILE_PATH, [], [createComment({ body: "" })]);

    expect(operations).toEqual([]);
  });

  it("inserts a comment when it first becomes non-empty", () => {
    const previousComments = [createComment({ body: "" })];
    const nextComments = [createComment({ body: "Menu anchor drifts after zoom" })];

    expect(diffFileCommentPromptSync(FILE_PATH, previousComments, nextComments)).toEqual([
      {
        comment: nextComments[0],
        type: "insert",
      },
    ]);
  });

  it("updates prompt nodes when an existing comment is edited", () => {
    const previousComments = [createComment({ body: "Old body" })];
    const nextComments = [createComment({ body: "New body" })];

    expect(diffFileCommentPromptSync(FILE_PATH, previousComments, nextComments)).toEqual([
      {
        attrs: createFileCommentNodeAttrs(FILE_PATH, nextComments[0]),
        type: "update",
      },
    ]);
  });

  it("removes prompt nodes when a comment is deleted", () => {
    const previousComments = [createComment({ body: "Keep me in sync", id: "comment-7" })];

    expect(diffFileCommentPromptSync(FILE_PATH, previousComments, [])).toEqual([
      {
        commentId: "comment-7",
        type: "remove",
      },
    ]);
  });

  it("re-inserts restored comments so undo can recover the prompt node", () => {
    const restoredComment = createComment({ body: "Restored after undo", id: "comment-9" });

    expect(diffFileCommentPromptSync(FILE_PATH, [], [restoredComment])).toEqual([
      {
        comment: restoredComment,
        type: "insert",
      },
    ]);
  });
});

function createComment(overrides: Partial<FileComment> = {}): FileComment {
  return {
    body: "Comment body",
    createdAt: 1_720_000_000_000,
    id: "comment-1",
    range: {
      endColumn: 7,
      endLine: 14,
      selectedText: "selected text",
      startColumn: 3,
      startLine: 12,
    },
    ...overrides,
    range: {
      endColumn: 7,
      endLine: 14,
      selectedText: "selected text",
      startColumn: 3,
      startLine: 12,
      ...overrides.range,
    },
  };
}
