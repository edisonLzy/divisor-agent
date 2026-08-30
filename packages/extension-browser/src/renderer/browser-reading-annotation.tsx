import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/react";
import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { BookOpenText } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BrowserReadingAnnotation } from "../common/types";

export interface BrowserReadingAnnotationAttrs {
  annotation: BrowserReadingAnnotation;
  instruction: string;
}

export const browserReadingAnnotationExtension = Node.create({
  name: "browserReadingAnnotation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      annotation: { default: null },
      instruction: { default: "Explain this selection" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-browser-reading-annotation]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as BrowserReadingAnnotationAttrs;
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-browser-reading-annotation": "" }),
      `Reading annotation · ${preview(attrs.annotation?.text)} · ${attrs.instruction}`,
    ];
  },

  renderText({ node }) {
    return serializeBrowserReadingAnnotation(node.attrs as BrowserReadingAnnotationAttrs);
  },

  addNodeView() {
    return ReactNodeViewRenderer(BrowserReadingAnnotationNode);
  },
});

function BrowserReadingAnnotationNode({ node }: NodeViewProps) {
  const attrs = node.attrs as BrowserReadingAnnotationAttrs;
  const annotation = attrs.annotation;
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  if (!annotation) return null;

  return (
    <NodeViewWrapper as="span" className="inline-flex" contentEditable={false}>
      <button
        ref={triggerRef}
        aria-describedby={open ? tooltipId : undefined}
        aria-label={`阅读批注：${preview(annotation.text)}`}
        className="mx-0.75 inline-flex max-w-72 cursor-pointer items-center gap-1.5 rounded-[5px] border-2 border-border bg-[color-mix(in_srgb,var(--signal-cyan)_35%,var(--card))] px-1.5 py-0.5 align-middle text-[11px] font-bold transition-colors hover:bg-[color-mix(in_srgb,var(--signal-cyan)_45%,var(--card))] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        onBlur={() => setOpen(false)}
        onClick={(event) => event.preventDefault()}
        onFocus={() => setOpen(true)}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        type="button"
      >
        <BookOpenText className="size-3.5 shrink-0" />
        <span className="truncate">{annotation.tag.displayLabel || annotation.tag.name}</span>
        <span className="truncate text-muted-foreground">· {preview(annotation.text)}</span>
      </button>
      {open ? (
        <ReadingAnnotationTooltip
          annotation={annotation}
          id={tooltipId}
          instruction={attrs.instruction}
          trigger={triggerRef.current}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

function ReadingAnnotationTooltip({
  annotation,
  id,
  instruction,
  trigger,
}: {
  annotation: BrowserReadingAnnotation;
  id: string;
  instruction: string;
  trigger: HTMLButtonElement | null;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const update = () => {
      void computePosition(trigger, tooltip, {
        middleware: [offset(12), flip(), shift({ padding: 10 })],
        placement: "top-start",
        strategy: "fixed",
      }).then(({ x, y }) => Object.assign(tooltip.style, { left: `${x}px`, top: `${y}px` }));
    };
    return autoUpdate(trigger, tooltip, update);
  }, [trigger]);

  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      className="pointer-events-none fixed left-0 top-0 w-[340px] rounded-[7px] border-2 border-border bg-popover p-3 text-popover-foreground shadow-[3px_3px_0_var(--border)]"
      role="tooltip"
    >
      <div className="mb-2 flex items-center gap-2 font-extrabold">
        <BookOpenText aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.2} />
        <span>{annotation.tag.displayLabel || annotation.tag.name}</span>
      </div>
      <div className="border-l-2 border-border pl-2 text-[11px] leading-[1.55] text-muted-foreground">
        {annotation.text}
      </div>
      {annotation.note.content ? (
        <div className="mt-2 whitespace-pre-wrap rounded-sm border border-border bg-secondary p-2 text-[11px] leading-[1.55]">
          {annotation.note.content}
        </div>
      ) : null}
      <div className="mt-2 text-[10px] text-muted-foreground">{instruction}</div>
    </div>,
    document.body,
  );
}

export function insertBrowserReadingAnnotation(
  editor: Editor,
  annotation: BrowserReadingAnnotation,
  instruction: string,
) {
  editor
    .chain()
    .focus()
    .insertContent({ attrs: { annotation, instruction }, type: "browserReadingAnnotation" })
    .insertContent(" ")
    .run();
}

export function serializeBrowserReadingAnnotation(attrs: BrowserReadingAnnotationAttrs) {
  const { annotation } = attrs;
  return `<reading-annotation url="${escapeAttribute(annotation.url)}" tag="${escapeAttribute(annotation.tag.name)}"><instruction>${escapeText(attrs.instruction)}</instruction><text>${escapeText(annotation.text)}</text><sentence>${escapeText(annotation.sentence ?? "")}</sentence><note>${escapeText(annotation.note.content)}</note></reading-annotation>`;
}

function preview(value: string) {
  return value.length > 48 ? `${value.slice(0, 47)}…` : value;
}

function escapeAttribute(value: string) {
  return escapeText(value).replaceAll('"', "&quot;");
}

function escapeText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
