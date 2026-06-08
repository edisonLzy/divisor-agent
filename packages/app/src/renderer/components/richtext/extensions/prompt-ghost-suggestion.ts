import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const GHOST_SUGGESTIONS = [
  "fix the failing tests",
  "explain this code path",
  "implement this feature and run type-check",
  "review the recent changes",
  "summarize this repository",
  "create a small refactor plan",
];

const promptGhostSuggestionPluginKey = new PluginKey<{ suffix: string }>("promptGhostSuggestion");

export const promptGhostSuggestionExtension = Extension.create({
  name: "promptGhostSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: promptGhostSuggestionPluginKey,
        state: {
          init: (_, state) => ({ suffix: getGhostSuggestionSuffix(state.doc.textContent) }),
          apply: (_, _value, _oldState, newState) => ({
            suffix: getGhostSuggestionSuffix(newState.doc.textContent),
          }),
        },
        props: {
          decorations(state) {
            const pluginState = promptGhostSuggestionPluginKey.getState(state);

            if (!pluginState?.suffix || !isCursorAtDocumentEnd(state)) {
              return DecorationSet.empty;
            }

            const widget = Decoration.widget(
              state.selection.from,
              () => {
                const element = document.createElement("span");
                element.className = "prompt-ghost-suggestion";
                element.textContent = pluginState.suffix;
                return element;
              },
              { side: 1 },
            );

            return DecorationSet.create(state.doc, [widget]);
          },
          handleKeyDown(view, event) {
            if (event.key !== "Tab" && event.key !== "ArrowRight") {
              return false;
            }

            const pluginState = promptGhostSuggestionPluginKey.getState(view.state);

            if (!pluginState?.suffix || !isCursorAtDocumentEnd(view.state)) {
              return false;
            }

            event.preventDefault();
            view.dispatch(view.state.tr.insertText(pluginState.suffix));
            return true;
          },
        },
      }),
    ];
  },
});

function getGhostSuggestionSuffix(text: string) {
  const normalizedText = text.trimStart().toLowerCase();

  if (normalizedText.length < 2) {
    return "";
  }

  const suggestion = GHOST_SUGGESTIONS.find((item) => item.startsWith(normalizedText));

  if (!suggestion || suggestion === normalizedText) {
    return "";
  }

  return suggestion.slice(normalizedText.length);
}

function isCursorAtDocumentEnd(state: EditorState) {
  const { selection } = state;

  return (
    selection.empty &&
    selection.$from.parentOffset === selection.$from.parent.content.size &&
    selection.$from.after() === state.doc.content.size
  );
}
