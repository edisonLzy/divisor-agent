import { useExtensionsContextAPI } from "@divisor-agent/extension-core/renderer";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { FileCode2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getFileBaseName } from "../../common/helper";
import { addOrActivateFileComment } from "../files-artifact/artifact-state";
import {
  FILE_COMMENT_EXTENSION_NAME,
  formatFileCommentRange,
  getFileCommentPreview,
  getFileCommentTooltipContent,
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
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

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
        ref={triggerRef}
        aria-describedby={isTooltipOpen ? tooltipId : undefined}
        aria-label={`打开代码注释：${fileName} · ${rangeLabel}`}
        className="mx-0.75 inline-flex max-w-60 cursor-pointer items-center gap-1.5 rounded-[5px] border-2 border-border bg-[color-mix(in_srgb,var(--signal-purple)_35%,var(--card))] px-1.5 py-0.5 align-middle text-[11px] leading-none font-bold text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--signal-purple)_45%,var(--card))] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        onBlur={() => setIsTooltipOpen(false)}
        onClick={handleClick}
        onFocus={() => setIsTooltipOpen(true)}
        onMouseEnter={() => setIsTooltipOpen(true)}
        onMouseLeave={() => setIsTooltipOpen(false)}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        type="button"
      >
        <FileCode2 aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.2} />
        <span className="truncate">{fileName}</span>
        <span className="shrink-0 text-muted-foreground">· {rangeLabel}</span>
      </button>
      {isTooltipOpen && (
        <FileCommentTooltip attrs={attrs} id={tooltipId} trigger={triggerRef.current} />
      )}
    </NodeViewWrapper>
  );
}

function FileCommentTooltip({
  attrs,
  id,
  trigger,
}: {
  attrs: FileCommentNodeAttrs;
  id: string;
  trigger: HTMLButtonElement | null;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const content = getFileCommentTooltipContent(attrs);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const updatePosition = () => {
      void computePosition(trigger, tooltip, {
        middleware: [offset(12), flip(), shift({ padding: 10 })],
        placement: "top-start",
        strategy: "fixed",
      }).then(({ x, y }) => {
        Object.assign(tooltip.style, { left: `${x}px`, top: `${y}px` });
      });
    };

    return autoUpdate(trigger, tooltip, updatePosition);
  }, [trigger]);

  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      className="pointer-events-none fixed left-0 top-0 w-[340px] rounded-[7px] border-2 border-border bg-popover p-3 text-popover-foreground shadow-[3px_3px_0_var(--border)]"
      role="tooltip"
    >
      <div className="mb-2.25 flex items-center gap-2 font-extrabold">
        <FileCode2 aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.2} />
        <span>{content.title}</span>
      </div>
      <div className="font-mono text-[10px] leading-normal font-semibold break-all text-muted-foreground">
        {content.meta} · {content.range}
      </div>
      <div className="mt-2.25 whitespace-pre-wrap rounded-sm border border-border bg-secondary p-2.25 text-[11px] leading-[1.55]">
        {content.preview}
      </div>
      <div className="mt-2.25 flex justify-between text-[10px] text-muted-foreground">
        <span>Artifact</span>
        <span>随 prompt 提交</span>
      </div>
    </div>,
    document.body,
  );
}
