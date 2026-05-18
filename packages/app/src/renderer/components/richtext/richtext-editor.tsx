import { keymap } from "prosemirror-keymap";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef } from "react";

import { createRichTextDocNode, type RichTextDocument, richTextSchema } from "./schema";

interface RichTextEditorProps {
  document: RichTextDocument;
  onChange: (document: RichTextDocument) => void;
  editable?: boolean;
  className?: string;
  onModEnter?: () => void;
}

function createEditorState(document: RichTextDocument, onModEnter?: () => void) {
  return EditorState.create({
    schema: richTextSchema,
    doc: createRichTextDocNode(document),
    plugins: onModEnter
      ? [
          keymap({
            "Mod-Enter": () => {
              onModEnter();
              return true;
            },
          }),
        ]
      : [],
  });
}

export function RichTextEditor({
  document,
  onChange,
  editable = true,
  className,
  onModEnter,
}: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) {
      return undefined;
    }

    const view = new EditorView(containerRef.current, {
      state: createEditorState(document, onModEnter),
      dispatchTransaction: (transaction) => {
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);
        onChange(nextState.doc.toJSON() as RichTextDocument);
      },
      editable: () => editable,
      attributes: className ? { class: className } : undefined,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [className, document, editable, onChange, onModEnter]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.setProps({
      editable: () => editable,
      attributes: className ? { class: className } : undefined,
    });
  }, [className, editable]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const nextDoc = createRichTextDocNode(document);
    if (view.state.doc.eq(nextDoc)) {
      return;
    }

    view.updateState(createEditorState(document, onModEnter));
  }, [document, onModEnter]);

  return <div ref={containerRef} />;
}
