import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { isEmptyNode } from '../utils.js';
import type { EditorView } from 'prosemirror-view';
import type { PluginCreator } from '../types.js';

const placeholderPluginKey = new PluginKey('placeholder');

interface PlaceholderPluginOptions {
  placeholder: string;
}

export function placeholderPlugin(options: PlaceholderPluginOptions): PluginCreator {
  const { placeholder } = options;

  return () => {
    let currentEditorView: EditorView | null = null;

    const plugin = new Plugin({
      key: placeholderPluginKey,
      view(view) {
        currentEditorView = view;
        return {
          destroy() {
            currentEditorView = null;
          },
        };
      },
      props: {
        decorations(state) {
          const isEditable = currentEditorView?.editable ?? true;
          if (isEditable === false) {
            return null;
          }

          const { from, to } = state.selection;
          if (from !== to) {
            return null;
          }

          const resolvedFrom = Math.max(from - 1, 0);
          const node = state.doc.nodeAt(resolvedFrom);
          if (!node) {
            return null;
          }

          if (isEmptyNode(node) === false) {
            return null;
          }

          const decoration = Decoration.node(resolvedFrom, resolvedFrom + node.nodeSize, {
            class: 'placeholder',
            'data-placeholder': placeholder,
          });
          return DecorationSet.create(state.doc, [decoration]);
        },
        attributes: {
          class: '[&_.placeholder]:before:content-[attr(data-placeholder)] [&_.placeholder]:before:text-neutral-500 [&_.placeholder]:before:float-left [&_.placeholder]:before:h-0 [&_.placeholder]:before:pointer-events-none',
        },
      },
    });

    return plugin;
  };
}
