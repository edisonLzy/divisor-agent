import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/react";
import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Globe2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BrowserAnnotationIntent, BrowserGrabPayload } from "../common/types";

export interface BrowserCommentAttrs {
  annotationId?: string;
  comment: string;
  context: BrowserGrabPayload;
  intent?: BrowserAnnotationIntent;
}

export const browserCommentExtension = Node.create({
  name: "browserComment",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      annotationId: { default: "" },
      comment: { default: "" },
      context: { default: null },
      intent: { default: "change" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-browser-comment]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as BrowserCommentAttrs;
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-browser-comment": "" }),
      `Browser comment · ${attrs.context.page.title || attrs.context.page.sanitizedUrl} · ${preview(attrs.comment)}`,
    ];
  },

  renderText({ node }) {
    return serializeBrowserComment(node.attrs as BrowserCommentAttrs);
  },

  addNodeView() {
    return ReactNodeViewRenderer(BrowserCommentNode);
  },
});

function BrowserCommentNode({ node }: NodeViewProps) {
  const attrs = node.attrs as BrowserCommentAttrs;
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const title = attrs.context.page.title || attrs.context.page.sanitizedUrl;

  return (
    <NodeViewWrapper as="span" className="inline-flex" contentEditable={false}>
      <button
        ref={triggerRef}
        aria-describedby={isTooltipOpen ? tooltipId : undefined}
        aria-label={`浏览器批注：${title}`}
        className="mx-0.75 inline-flex max-w-72 cursor-pointer items-center gap-1.5 rounded-[5px] border-2 border-border bg-[color-mix(in_srgb,var(--signal-cyan)_35%,var(--card))] px-1.5 py-0.5 align-middle text-[11px] font-bold transition-colors hover:bg-[color-mix(in_srgb,var(--signal-cyan)_45%,var(--card))] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        onBlur={() => setIsTooltipOpen(false)}
        onClick={(event) => event.preventDefault()}
        onFocus={() => setIsTooltipOpen(true)}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseEnter={() => setIsTooltipOpen(true)}
        onMouseLeave={() => setIsTooltipOpen(false)}
        type="button"
      >
        <Globe2 className="size-3.5 shrink-0" />
        <span className="truncate">{title}</span>
        <span className="truncate text-muted-foreground">· {preview(attrs.comment)}</span>
      </button>
      {isTooltipOpen ? (
        <BrowserCommentTooltip attrs={attrs} id={tooltipId} trigger={triggerRef.current} />
      ) : null}
    </NodeViewWrapper>
  );
}

function BrowserCommentTooltip({
  attrs,
  id,
  trigger,
}: {
  attrs: BrowserCommentAttrs;
  id: string;
  trigger: HTMLButtonElement | null;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const title = attrs.context.page.title || attrs.context.page.sanitizedUrl;

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
      <div className="mb-2 flex items-center gap-2 font-extrabold">
        <Globe2 aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.2} />
        <span className="truncate">{title}</span>
      </div>
      <div className="font-mono text-[10px] leading-normal font-semibold break-all text-muted-foreground">
        {attrs.context.page.sanitizedUrl}
      </div>
      {attrs.context.target.textSnippet ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold text-muted-foreground">批注原文</div>
          <div className="whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-[11px] leading-[1.55] text-muted-foreground">
            {attrs.context.target.textSnippet}
          </div>
        </div>
      ) : null}
      <div className="mt-2 whitespace-pre-wrap rounded-sm border border-border bg-secondary p-2 text-[11px] leading-[1.55]">
        {attrs.comment}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        {`<${attrs.context.target.tagName}>`} · {attrs.context.target.selector}
      </div>
    </div>,
    document.body,
  );
}

export function insertBrowserComment(editor: Editor, attrs: BrowserCommentAttrs): void {
  editor.chain().focus().insertContent({ attrs, type: "browserComment" }).insertContent(" ").run();
}

export function updateBrowserComment(editor: Editor, annotationId: string, comment: string): void {
  let transaction = editor.state.tr;
  let changed = false;

  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "browserComment" || node.attrs.annotationId !== annotationId)
      return true;
    transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, comment });
    changed = true;
    return false;
  });

  if (changed) editor.view.dispatch(transaction);
}

export function removeBrowserComment(editor: Editor, annotationId: string): void {
  const positions: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "browserComment" && node.attrs.annotationId === annotationId) {
      positions.push({ from: position, to: position + node.nodeSize });
      return false;
    }
    return true;
  });

  if (!positions.length) return;
  let transaction = editor.state.tr;
  for (const position of positions.reverse()) {
    transaction = transaction.delete(position.from, position.to);
  }
  editor.view.dispatch(transaction);
}

export function serializeBrowserComment(attrs: BrowserCommentAttrs) {
  const context = attrs.context;
  const target = context.target;
  const intent = attrs.intent || "change";
  return `<browser-comment url="${escapeAttribute(context.page.sanitizedUrl)}" title="${escapeAttribute(context.page.title)}" selector="${escapeAttribute(target.selector)}" intent="${intent}"><comment>${escapeText(attrs.comment)}</comment><element tag="${escapeAttribute(target.tagName)}" role="${escapeAttribute(target.accessibility.role ?? "")}" name="${escapeAttribute(target.accessibility.accessibleName ?? "")}"><text>${escapeText(target.textSnippet)}</text><html>${escapeText(target.htmlSnippet)}</html><nearby>${escapeText(context.nearbyText.join("\n"))}</nearby></element></browser-comment>`;
}

function preview(value: string) {
  const normalized = value.trim() || "Selected element";
  return normalized.length > 48 ? `${normalized.slice(0, 47)}…` : normalized;
}

function escapeAttribute(value: string) {
  return escapeText(value).replaceAll('"', "&quot;");
}

function escapeText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
