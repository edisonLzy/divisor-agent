import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Globe2 } from "lucide-react";

import type { BrowserElementPayload } from "../common/types";

export interface BrowserCommentAttrs {
  comment: string;
  context: BrowserElementPayload;
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
      `Browser comment · ${attrs.context.title || attrs.context.url} · ${preview(attrs.comment)}`,
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
  return (
    <NodeViewWrapper as="span" className="inline-flex" contentEditable={false}>
      <span
        className="mx-0.75 inline-flex max-w-72 items-center gap-1.5 rounded-[5px] border-2 border-border bg-[color-mix(in_srgb,var(--signal-purple)_35%,var(--card))] px-1.5 py-0.5 align-middle text-[11px] font-bold"
        title={`${attrs.context.url}\n${attrs.context.selector}\n${attrs.comment}`}
      >
        <Globe2 className="size-3.5 shrink-0" />
        <span className="truncate">{attrs.context.title || attrs.context.url}</span>
        <span className="truncate text-muted-foreground">· {preview(attrs.comment)}</span>
      </span>
    </NodeViewWrapper>
  );
}

export function serializeBrowserComment(attrs: BrowserCommentAttrs) {
  const context = attrs.context;
  return `<browser-comment url="${escapeAttribute(context.url)}" title="${escapeAttribute(context.title)}" selector="${escapeAttribute(context.selector)}" screenshot="${escapeAttribute(context.screenshotPath ?? "")}"><comment>${escapeText(attrs.comment)}</comment><element tag="${escapeAttribute(context.tagName)}" role="${escapeAttribute(context.accessibility.role)}" name="${escapeAttribute(context.accessibility.name)}"><text>${escapeText(context.text)}</text><html>${escapeText(context.html)}</html><nearby>${escapeText(context.nearbyText.join("\n"))}</nearby></element></browser-comment>`;
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
