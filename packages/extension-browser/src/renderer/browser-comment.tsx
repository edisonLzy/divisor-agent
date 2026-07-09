import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Globe2 } from "lucide-react";

import type { BrowserAnnotationIntent, BrowserGrabPayload } from "../common/types";

export interface BrowserCommentAttrs {
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
  const intentColor =
    attrs.intent === "fix"
      ? "var(--signal-amber)"
      : attrs.intent === "question"
        ? "var(--signal-purple)"
        : attrs.intent === "approve"
          ? "var(--signal-green)"
          : "var(--signal-blue)";
  return (
    <NodeViewWrapper as="span" className="inline-flex" contentEditable={false}>
      <span
        className="mx-0.75 inline-flex max-w-72 items-center gap-1.5 rounded-[5px] border-2 border-border px-1.5 py-0.5 align-middle text-[11px] font-bold"
        style={{
          backgroundColor: `color-mix(in_srgb, ${intentColor} 35%, var(--card))`,
        }}
        title={`${attrs.context.page.sanitizedUrl}\n${attrs.context.target.selector}\n${attrs.comment}`}
      >
        <Globe2 className="size-3.5 shrink-0" />
        <span className="truncate">
          {attrs.context.page.title || attrs.context.page.sanitizedUrl}
        </span>
        <span className="truncate text-muted-foreground">· {preview(attrs.comment)}</span>
      </span>
    </NodeViewWrapper>
  );
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
