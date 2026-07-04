import type { Editor, JSONContent } from "@tiptap/core";

import type { FileComment } from "../files-artifact/types";
import {
  areFileCommentNodeAttrsEqual,
  createFileCommentNodeAttrs,
  FILE_COMMENT_EXTENSION_NAME,
  type FileCommentNodeAttrs,
} from "./model";

interface FileCommentPromptInsertOp {
  comment: FileComment;
  type: "insert";
}

interface FileCommentPromptRemoveOp {
  commentId: string;
  type: "remove";
}

interface FileCommentPromptUpdateOp {
  attrs: FileCommentNodeAttrs;
  type: "update";
}

export type FileCommentPromptSyncOp =
  | FileCommentPromptInsertOp
  | FileCommentPromptRemoveOp
  | FileCommentPromptUpdateOp;

export function diffFileCommentPromptSync(
  filePath: string,
  previousComments: FileComment[],
  nextComments: FileComment[],
): FileCommentPromptSyncOp[] {
  const previousById = new Map(previousComments.map((comment) => [comment.id, comment]));
  const nextById = new Map(nextComments.map((comment) => [comment.id, comment]));
  const operations: FileCommentPromptSyncOp[] = [];

  for (const previousComment of previousComments) {
    if (!nextById.has(previousComment.id)) {
      operations.push({ commentId: previousComment.id, type: "remove" });
    }
  }

  for (const nextComment of nextComments) {
    const previousComment = previousById.get(nextComment.id);
    const nextBody = nextComment.body.trim();

    if (!previousComment) {
      if (nextBody) {
        operations.push({ comment: nextComment, type: "insert" });
      }
      continue;
    }

    const previousBody = previousComment.body.trim();
    if (!previousBody && nextBody) {
      operations.push({ comment: nextComment, type: "insert" });
      continue;
    }

    if (!nextBody) {
      operations.push({ commentId: nextComment.id, type: "remove" });
      continue;
    }

    const previousAttrs = createFileCommentNodeAttrs(filePath, previousComment);
    const nextAttrs = createFileCommentNodeAttrs(filePath, nextComment);
    if (!areFileCommentNodeAttrsEqual(previousAttrs, nextAttrs)) {
      operations.push({ attrs: nextAttrs, type: "update" });
    }
  }

  return operations;
}

export function syncPromptFileComments(
  editor: Editor | null,
  filePath: string,
  previousComments: FileComment[],
  nextComments: FileComment[],
): void {
  if (!editor) return;

  const operations = diffFileCommentPromptSync(filePath, previousComments, nextComments);

  for (const operation of operations) {
    if (operation.type === "remove") {
      removeFileCommentNodes(editor, operation.commentId);
      continue;
    }

    if (operation.type === "update") {
      updateFileCommentNodes(editor, operation.attrs);
      continue;
    }

    if (hasFileCommentNode(editor, operation.comment.id)) {
      updateFileCommentNodes(editor, createFileCommentNodeAttrs(filePath, operation.comment));
      continue;
    }

    insertFileCommentNode(editor, createFileCommentNodeAttrs(filePath, operation.comment));
  }
}

function hasFileCommentNode(editor: Editor, commentId: string): boolean {
  return getFileCommentNodePositions(editor, commentId).length > 0;
}

function insertFileCommentNode(editor: Editor, attrs: FileCommentNodeAttrs): void {
  const { from, to } = editor.state.selection;
  const insertion = buildFileCommentInsertion(editor, attrs, from, to);
  editor.chain().focus().insertContentAt({ from, to }, insertion).run();
}

function updateFileCommentNodes(editor: Editor, attrs: FileCommentNodeAttrs): void {
  const positions = getFileCommentNodePositions(editor, attrs.commentId);
  if (positions.length === 0) return;

  let transaction = editor.state.tr;
  for (const position of positions) {
    transaction = transaction.setNodeMarkup(position.pos, undefined, attrs, position.marks);
  }

  if (transaction.docChanged) {
    editor.view.dispatch(transaction);
  }
}

function removeFileCommentNodes(editor: Editor, commentId: string): void {
  const positions = getFileCommentNodePositions(editor, commentId);
  if (positions.length === 0) return;

  let transaction = editor.state.tr;
  for (const position of positions.slice().reverse()) {
    transaction = transaction.delete(position.pos, position.pos + position.nodeSize);
  }

  if (transaction.docChanged) {
    editor.view.dispatch(transaction);
  }
}

function buildFileCommentInsertion(
  editor: Editor,
  attrs: FileCommentNodeAttrs,
  from: number,
  to: number,
): JSONContent[] {
  const content: JSONContent[] = [];
  if (needsLeadingSpace(editor, from)) {
    content.push({ type: "text", text: " " });
  }

  content.push({
    attrs,
    type: FILE_COMMENT_EXTENSION_NAME,
  });

  if (needsTrailingSpace(editor, to)) {
    content.push({ type: "text", text: " " });
  }

  return content;
}

function getFileCommentNodePositions(editor: Editor, commentId: string) {
  const positions: Array<{
    marks: ReturnType<typeof editor.state.selection.$from.marks>;
    nodeSize: number;
    pos: number;
  }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== FILE_COMMENT_EXTENSION_NAME) return true;
    if (node.attrs.commentId !== commentId) return true;

    positions.push({
      marks: node.marks,
      nodeSize: node.nodeSize,
      pos,
    });
    return true;
  });

  return positions;
}

function needsLeadingSpace(editor: Editor, from: number): boolean {
  if (from <= 1) return false;
  const previousCharacter = editor.state.doc.textBetween(Math.max(0, from - 1), from, "", "");
  return previousCharacter.length > 0 && !/\s/u.test(previousCharacter);
}

function needsTrailingSpace(editor: Editor, to: number): boolean {
  const nextCharacter = editor.state.doc.textBetween(to, to + 1, "", "");
  return nextCharacter.length > 0 && !/\s/u.test(nextCharacter);
}
