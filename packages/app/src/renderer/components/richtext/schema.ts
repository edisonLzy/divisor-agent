import { Schema, Node as PMNode } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";

export type RichTextDocument = Record<string, unknown>;

export const richTextSchema = new Schema({
  nodes: basicSchema.spec.nodes,
  marks: basicSchema.spec.marks,
});

export function createEmptyRichTextDocument(): RichTextDocument {
  return (
    richTextSchema.topNodeType.createAndFill()?.toJSON() ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    }
  );
}

export function createRichTextDocNode(document?: RichTextDocument) {
  if (!document) {
    return PMNode.fromJSON(richTextSchema, createEmptyRichTextDocument());
  }

  try {
    return PMNode.fromJSON(richTextSchema, document);
  } catch {
    return PMNode.fromJSON(richTextSchema, createEmptyRichTextDocument());
  }
}

export function readRichText(document?: RichTextDocument) {
  const doc = createRichTextDocNode(document);
  return doc.textBetween(0, doc.content.size, "\n\n", "\n").trim();
}
