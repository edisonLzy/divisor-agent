import type { Editor } from "@tiptap/core";

export class SharedPromptEditor {
  private _editor: Editor | null = null;

  get editor() {
    return this._editor;
  }

  set editor(editor: Editor | null) {
    this._editor = editor;
  }

  static create() {
    return new SharedPromptEditor();
  }
}
