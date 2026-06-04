import { computePosition, flip, shift, size } from "@floating-ui/dom";
import {
  filterCommandItems,
  SuggestionsPanel,
} from "@renderer/components/richtext/components/suggestions-panel";
import type { CommandItem } from "@renderer/components/richtext/types";
import type { Range } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import { posToDOMRect, ReactRenderer, type Editor } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "prosemirror-state";
import { useMemo } from "react";

export const slashCommandSuggestionPluginKey = new PluginKey("slashCommandSuggestion");

export interface SlashCommandSelection {
  command: CommandItem;
  editor: Editor;
  range: Range;
}

interface UseSlashCommandsExtensionOptions {
  commands: CommandItem[];
  onSelectCommand: (selection: SlashCommandSelection) => void;
}

export function useSlashCommandsExtension({
  commands,
  onSelectCommand,
}: UseSlashCommandsExtensionOptions) {
  return useMemo(() => {
    const SlashCommandMention = Mention.extend({
      name: "slashCommandMention",
    });

    return SlashCommandMention.configure({
      HTMLAttributes: {
        class:
          "mention inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-200",
      },
      renderText({ node, suggestion }) {
        return `${suggestion?.char ?? "/"}${node.attrs.label ?? node.attrs.id ?? ""}`;
      },
      suggestion: {
        char: "/",
        allowSpaces: true,
        startOfLine: false,
        pluginKey: slashCommandSuggestionPluginKey,
        decorationClass: "file-suggestion-query",
        decorationContent: "search slash commands",
        decorationEmptyClass: "is-empty",
        items: ({ query }) => filterCommandItems(commands, query),
        command: ({ editor, range, props }) => {
          onSelectCommand({
            command: props,
            editor,
            range,
          });
        },
        render: () => {
          let component: ReactRenderer<
            React.ComponentProps<typeof SuggestionsPanel> & { items: CommandItem[] }
          > | null = null;
          let selectedIndex = 0;
          let currentItemsKey = "";
          let latestProps: {
            items: CommandItem[];
            command: (item: CommandItem) => void;
            query: string;
            clientRect?: (() => DOMRect | null) | null;
            editor: Editor;
          } | null = null;

          const updatePosition = () => {
            if (!component || !latestProps) {
              return;
            }

            const props = latestProps;
            const floatingElement = component.element as HTMLElement;
            const rect = props.clientRect?.();

            if (!rect) {
              return;
            }

            const virtualElement = {
              getBoundingClientRect: () =>
                posToDOMRect(
                  props.editor.view,
                  props.editor.state.selection.from,
                  props.editor.state.selection.to,
                ),
            };

            void computePosition(virtualElement, floatingElement, {
              placement: "bottom-start",
              strategy: "absolute",
              middleware: [
                shift({ padding: 16 }),
                flip({ padding: 16 }),
                size({
                  padding: 16,
                  apply({ availableHeight, elements }) {
                    elements.floating.style.width = `${Math.min(920, window.innerWidth - 32)}px`;
                    elements.floating.style.maxHeight = `${Math.min(360, availableHeight)}px`;
                  },
                }),
              ],
            }).then(({ x, y, strategy }) => {
              floatingElement.style.position = strategy;
              floatingElement.style.left = `${x}px`;
              floatingElement.style.top = `${y}px`;
            });
          };

          const renderPopup = () => {
            if (!component || !latestProps) {
              return;
            }

            const props = latestProps;

            component.updateProps({
              items: commands,
              query: props.query,
              selectedIndex,
              onSelect: (item) => props.command(item),
              onHighlight: (index) => {
                selectedIndex = index;
                renderPopup();
              },
              maxHeight: 360,
            });
          };

          const updatePopup = (props: {
            items: CommandItem[];
            command: (item: CommandItem) => void;
            query: string;
            clientRect?: (() => DOMRect | null) | null;
            editor: Editor;
          }) => {
            latestProps = props;

            const nextItemsKey = props.items.map((item) => item.id).join("\n");
            if (nextItemsKey !== currentItemsKey) {
              currentItemsKey = nextItemsKey;
              selectedIndex = 0;
            }

            if (props.items.length > 0) {
              selectedIndex = Math.min(selectedIndex, props.items.length - 1);
            }

            renderPopup();
            updatePosition();
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(SuggestionsPanel, {
                editor: props.editor,
                props: {
                  items: commands,
                  query: props.query,
                  selectedIndex,
                  onSelect: (item) => props.command(item),
                  onHighlight: () => {},
                  maxHeight: 360,
                },
              });

              component.element.dataset.suggestion = "slash-commands";
              document.body.appendChild(component.element);

              updatePopup(props);
            },
            onUpdate: (props) => {
              updatePopup(props);
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              const items = latestProps?.items ?? [];

              if (props.event.key === "ArrowDown" && items.length > 0) {
                selectedIndex = (selectedIndex + 1) % items.length;
                if (latestProps) {
                  updatePopup(latestProps);
                }
                return true;
              }

              if (props.event.key === "ArrowUp" && items.length > 0) {
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                if (latestProps) {
                  updatePopup(latestProps);
                }
                return true;
              }

              if (props.event.key === "Enter" && items.length > 0) {
                latestProps?.command(items[selectedIndex]);
                return true;
              }

              if (props.event.key === "Escape") {
                component?.destroy();
                return true;
              }

              return false;
            },
            onExit: () => {
              component?.destroy();
              component = null;
            },
          };
        },
      } satisfies Omit<SuggestionOptions<CommandItem>, "editor">,
    });
  }, [commands, onSelectCommand]);
}

export function getSelectedCommandIds(editor: Editor | null) {
  const ids = new Set<string>();
  const doc = editor?.getJSON();

  function visit(
    node:
      | {
          type?: string;
          attrs?: { id?: unknown };
          content?: unknown[];
        }
      | undefined,
  ) {
    if (!node) {
      return;
    }

    if (
      (node.type === "slashCommandMention" || node.type === "skillNode") &&
      typeof node.attrs?.id === "string"
    ) {
      ids.add(node.attrs.id);
    }

    for (const child of node.content ?? []) {
      visit(
        child as {
          type?: string;
          attrs?: { id?: unknown };
          content?: unknown[];
        },
      );
    }
  }

  visit(doc);
  return Array.from(ids);
}
