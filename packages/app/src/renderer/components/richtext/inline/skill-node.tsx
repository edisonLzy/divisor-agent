import type { SkillScope } from "@shared/skills-ipc";
import { mergeAttributes, type Range } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import { Wrench } from "lucide-react";

import { IconNode } from "../components/icon-node";

const SKILL_NODE_NAME = "skillNode";

interface SkillNodeAttrs {
  id: string;
  label?: string | null;
  scope?: SkillScope | null;
}

interface InsertSkillNodeOptions {
  editor: Editor;
  skill: SkillNodeAttrs;
  range?: Range;
  trailingSpace?: boolean;
}

export function insertSkillNode({
  editor,
  skill,
  range,
  trailingSpace = true,
}: InsertSkillNodeOptions) {
  const content = [
    {
      type: SKILL_NODE_NAME,
      attrs: {
        id: skill.id,
        label: skill.label ?? skill.id,
        scope: skill.scope ?? null,
      },
    },
    ...(trailingSpace ? [{ type: "text", text: " " }] : []),
  ];

  const chain = editor.chain().focus();

  if (range) {
    return chain.insertContentAt(range, content).run();
  }

  return chain.insertContent(content).run();
}

export const skillNode = Mention.extend({
  name: SKILL_NODE_NAME,
  selectable: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      scope: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-scope"),
        renderHTML: (attributes: { scope?: SkillScope | null }) =>
          attributes.scope ? { "data-scope": attributes.scope } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SkillNodeView);
  },
}).configure({
  HTMLAttributes: {
    class: "skill-node",
    "data-inline-node": "skill",
  },
  renderHTML({ node, options }) {
    return [
      "span",
      mergeAttributes(options.HTMLAttributes, {
        "data-skill-id": node.attrs.id,
        "data-skill-label": node.attrs.label ?? node.attrs.id,
      }),
      `@${node.attrs.label ?? node.attrs.id ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.label ?? node.attrs.id ?? ""}`;
  },
});

function SkillNodeView({ node }: NodeViewProps) {
  const label = node.attrs.label ?? node.attrs.id ?? "";

  return (
    <NodeViewWrapper as="span" className="inline-flex" contentEditable={false}>
      <IconNode
        icon={<Wrench aria-hidden="true" />}
        className="bg-amber-500/15 text-amber-700 dark:text-amber-200"
      >
        {label}
      </IconNode>
    </NodeViewWrapper>
  );
}
