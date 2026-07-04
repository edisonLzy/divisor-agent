import { useExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { FileCode2, MessageSquareQuote } from "lucide-react";

import { getFileBaseName } from "../../common/helper";
import { addOrActivateFileComment } from "../files-artifact/artifact-state";
import {
  FILE_COMMENT_EXTENSION_NAME,
  formatFileCommentRange,
  getFileCommentPreview,
  serializeFileCommentNodeToXml,
  truncateFileCommentText,
  type FileCommentNodeAttrs,
} from "./model";

export const fileCommentExtension = createFileCommentExtension(FILE_COMMENT_EXTENSION_NAME);

function createFileCommentExtension(name: string) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: false,

    addAttributes() {
      return {
        body: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-body") ?? "",
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-body": attributes.body,
          }),
        },
        commentId: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-comment-id") ?? "",
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-comment-id": attributes.commentId,
          }),
        },
        endColumn: {
          default: 0,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-end-column") ?? 0),
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-end-column": attributes.endColumn,
          }),
        },
        endLine: {
          default: 0,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-end-line") ?? 0),
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-end-line": attributes.endLine,
          }),
        },
        filePath: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-file-path") ?? "",
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-file-path": attributes.filePath,
          }),
        },
        selectedText: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-selected-text") ?? "",
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-selected-text": attributes.selectedText,
          }),
        },
        startColumn: {
          default: 0,
          parseHTML: (element: HTMLElement) =>
            Number(element.getAttribute("data-start-column") ?? 0),
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-start-column": attributes.startColumn,
          }),
        },
        startLine: {
          default: 0,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-start-line") ?? 0),
          renderHTML: (attributes: FileCommentNodeAttrs) => ({
            "data-start-line": attributes.startLine,
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: "span[data-file-comment-node]" }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const attrs = node.attrs as FileCommentNodeAttrs;
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          "data-file-comment-node": "",
          class: "file-comment-node-render",
        }),
        `Comment · ${getFileBaseName(attrs.filePath)} · ${formatFileCommentRange(attrs)} · ${truncateFileCommentText(getFileCommentPreview(attrs), 48)}`,
      ];
    },

    renderText({ node }) {
      return serializeFileCommentNodeToXml(node.attrs as FileCommentNodeAttrs);
    },

    addNodeView() {
      return ReactNodeViewRenderer(FileCommentNodeView);
    },
  });
}

function FileCommentNodeView({ node }: NodeViewProps) {
  const api = useExtensionsContextAPI();
  const attrs = node.attrs as FileCommentNodeAttrs;
  const fileName = getFileBaseName(attrs.filePath);
  const rangeLabel = formatFileCommentRange(attrs);
  const preview = truncateFileCommentText(getFileCommentPreview(attrs), 44);
  const tooltip = `${fileName} · ${rangeLabel}\n${attrs.body || attrs.selectedText}`;

  const handleClick = () => {
    const sessionId = api.getActiveSessionId();
    if (!sessionId) return;
    addOrActivateFileComment(api, sessionId, {
      commentId: attrs.commentId,
      endLine: attrs.endLine,
      path: attrs.filePath,
      startLine: attrs.startLine,
    });
  };

  return (
    <NodeViewWrapper as="span" className="inline-flex" contentEditable={false}>
      <button
        className="file-comment-node-button"
        onClick={handleClick}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        title={tooltip}
        type="button"
      >
        <span className="file-comment-node-icons">
          <MessageSquareQuote className="size-3.5" strokeWidth={1.8} />
          <FileCode2 className="size-3.5" strokeWidth={1.8} />
        </span>
        <span className="file-comment-node-file">{fileName}</span>
        <span className="file-comment-node-range">{rangeLabel}</span>
        <span className="file-comment-node-preview">{preview}</span>
      </button>
    </NodeViewWrapper>
  );
}
