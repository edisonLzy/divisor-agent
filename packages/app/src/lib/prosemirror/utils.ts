import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export function isEmptyNode(node: Node): boolean {
  if (node.isText) {
    return !node.text;
  }

  if (node.isAtom || node.isLeaf) {
    return false;
  }

  if (node.content.childCount === 0) {
    return true;
  }

  if (node.content.childCount === 1) {
    const child = node.content.firstChild;
    if (child === null) {
      return false;
    }
    return isEmptyNode(child);
  }

  return false;
}

export function clearContent(view: EditorView): void {
  const emptyParagraph = view.state.schema.nodes['paragraph'].create();
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, emptyParagraph);
  view.dispatch(tr);
}
