import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export type EditorViewGetter = () => EditorView;

export type PluginCreator = (viewGetter: EditorViewGetter) => Plugin;
