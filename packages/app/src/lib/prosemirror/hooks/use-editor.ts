import { useRef, useEffect, useState } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { dispatchCustomEvent } from './use-editor-event.js';
import type { PluginCreator } from '../types.js';
import type { EditorProps } from 'prosemirror-view';
import type { Schema } from 'prosemirror-model';

interface UseEditorOptions {
  schema: Schema;
  plugins: PluginCreator[];
  editable: EditorProps['editable'];
}

export function useEditor<E extends HTMLDivElement>(
  options: UseEditorOptions,
): readonly [EditorView | null, React.MutableRefObject<E | null>] {
  const { schema, plugins, editable } = options;

  const editorMountElRef = useRef<E | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  useEffect(() => {
    if (editorMountElRef.current === null) {
      return;
    }

    const mountEl = editorMountElRef.current;
    const viewGetter = () => view;

    const view = new EditorView(mountEl, {
      state: EditorState.create({
        schema,
        plugins: plugins.map((plugin) => plugin(viewGetter)),
      }),
      editable,
      attributes: {
        class: [
          'w-full text-sm leading-relaxed outline-none whitespace-pre-wrap text-neutral-100',
          '[&_.ProseMirror-separator]:inline [&_.ProseMirror-separator]:border-none [&_.ProseMirror-separator]:m-0',
        ].join(' '),
      },
      dispatchTransaction(tr) {
        const oldState = view.state;
        const newState = view.state.apply(tr);

        view.updateState(newState);

        if (!newState.selection.eq(oldState.selection)) {
          dispatchCustomEvent(view, 'selectionChanged');
        }

        if (!newState.doc.eq(oldState.doc)) {
          dispatchCustomEvent(view, 'docChanged');
        }
      },
    });

    setEditorView(view);

    return () => {
      view.destroy();
    };
  }, []);

  return [editorView, editorMountElRef] as const;
}
