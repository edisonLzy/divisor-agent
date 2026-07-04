import { mergeAttributes, Node, type Editor } from "@tiptap/core";

export const EXAMPLE_TAG_NODE_NAME = "exampleTag";

interface ExampleTagAttrs {
  label: string;
}

export interface InsertExampleTagOptions {
  editor: Editor;
  label: string;
}

export function insertExampleTagNode({ editor, label }: InsertExampleTagOptions) {
  return editor
    .chain()
    .focus()
    .insertContent([
      {
        type: EXAMPLE_TAG_NODE_NAME,
        attrs: { label },
      },
      { type: "text", text: " " },
    ])
    .run();
}

/**
 * Demo TipTap node registered by extension-example via
 * `ctx.promptInput.registerExtension`. Mirrors the host's `skillNode` but is
 * fully self-contained inside the extension package so it exercises the
 * extension point end-to-end.
 *
 * The node is intentionally rendered with plain HTML (no React NodeView) so
 * that `extension-example` only needs `@tiptap/core` as a peer dep — adding
 * `@tiptap/react` would pull React into every extension package, which is
 * unnecessary when the host already mounts the React renderer.
 */
export const exampleTagNode = Node.create({
  name: EXAMPLE_TAG_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      label: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-label") ?? "",
        renderHTML: (attributes: ExampleTagAttrs) =>
          attributes.label ? { "data-label": attributes.label } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-example-tag]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-example-tag": "",
        class: "example-tag",
      }),
      `@${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return `<example-tag label="${escapeXmlAttribute(node.attrs.label)}"></example-tag>`;
  },
});

function escapeXmlAttribute(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
