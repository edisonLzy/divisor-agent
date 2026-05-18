import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef } from "react";

import { createRichTextDocNode, type RichTextDocument, richTextSchema } from "./schema";

interface RichTextDocumentViewProps {
  document: RichTextDocument;
  className?: string;
}

export function RichTextDocumentView({ document, className }: RichTextDocumentViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const view = new EditorView(containerRef.current, {
      state: EditorState.create({
        schema: richTextSchema,
        doc: createRichTextDocNode(document),
      }),
      editable: () => false,
      dispatchTransaction: (transaction) => {
        view.updateState(view.state.apply(transaction));
      },
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const nextDoc = createRichTextDocNode(document);
    if (view.state.doc.eq(nextDoc)) {
      return;
    }

    view.updateState(
      EditorState.create({
        schema: richTextSchema,
        doc: nextDoc,
      }),
    );
  }, [document]);

  return <div ref={containerRef} className={className} />;
}
