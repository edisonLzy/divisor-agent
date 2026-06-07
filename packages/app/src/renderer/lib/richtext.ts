import type { JSONContent } from "@tiptap/core";

export function jsonContentToText(content: JSONContent): string {
  const blocks: string[] = [];

  collectBlockText(content, blocks);

  if (blocks.length > 0) {
    return blocks.join("\n").trim();
  }

  return nodeText(content).trim();
}

function collectBlockText(node: JSONContent, blocks: string[]) {
  if (isTextBlockNode(node)) {
    const text = nodeText(node).trim();
    if (text) {
      blocks.push(text);
    }
    return;
  }

  for (const child of node.content ?? []) {
    collectBlockText(child, blocks);
  }
}

function nodeText(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.content ?? []).map((child) => nodeText(child)).join("");
}

function isTextBlockNode(node: JSONContent) {
  return node.type === "paragraph" || node.type === "heading" || node.type === "listItem";
}
