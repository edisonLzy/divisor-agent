import type { FileComment } from "../files-artifact/types";

export const FILE_COMMENT_EXTENSION_NAME = "xxxextension";

export interface FileCommentNodeAttrs {
  body: string;
  commentId: string;
  endColumn: number;
  endLine: number;
  filePath: string;
  selectedText: string;
  startColumn: number;
  startLine: number;
}

export function createFileCommentNodeAttrs(
  filePath: string,
  comment: FileComment,
): FileCommentNodeAttrs {
  return {
    body: comment.body,
    commentId: comment.id,
    endColumn: comment.range.endColumn,
    endLine: comment.range.endLine,
    filePath,
    selectedText: comment.range.selectedText,
    startColumn: comment.range.startColumn,
    startLine: comment.range.startLine,
  };
}

export function areFileCommentNodeAttrsEqual(
  a: FileCommentNodeAttrs,
  b: FileCommentNodeAttrs,
): boolean {
  return (
    a.body === b.body &&
    a.commentId === b.commentId &&
    a.endColumn === b.endColumn &&
    a.endLine === b.endLine &&
    a.filePath === b.filePath &&
    a.selectedText === b.selectedText &&
    a.startColumn === b.startColumn &&
    a.startLine === b.startLine
  );
}

export function formatFileCommentRange(attrs: FileCommentNodeAttrs): string {
  if (attrs.startLine === attrs.endLine) {
    return `L${attrs.startLine}`;
  }

  return `L${attrs.startLine}-${attrs.endLine}`;
}

export function getFileCommentPreview(attrs: FileCommentNodeAttrs): string {
  const body = attrs.body.trim();
  if (body) return body;
  const selectedText = attrs.selectedText.trim();
  if (selectedText) return selectedText;
  return "Comment";
}

export function serializeFileCommentNodeToXml(attrs: FileCommentNodeAttrs): string {
  return `<file-comment id="${escapeXmlAttribute(attrs.commentId)}" path="${escapeXmlAttribute(attrs.filePath)}" start-line="${attrs.startLine}" start-column="${attrs.startColumn}" end-line="${attrs.endLine}" end-column="${attrs.endColumn}"><body>${escapeXmlText(attrs.body)}</body><selection>${escapeXmlText(attrs.selectedText)}</selection></file-comment>`;
}

export function truncateFileCommentText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function escapeXmlAttribute(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlText(value: unknown) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
