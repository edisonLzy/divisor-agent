import {
  filterCommandItems,
  SuggestionsPanel,
} from "@renderer/components/richtext/components/suggestions-panel";
import type { CommandItem } from "@renderer/components/richtext/types";
import { useLatest } from "@renderer/hooks/use-latest";
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
  getFloatingReference?: () => Element | VirtualElement | null;
  onSelectCommand: (selection: SlashCommandSelection) => void;
}

export function useSlashCommandsExtension({
  commands,
  getFloatingReference,
  onSelectCommand,
}: UseSlashCommandsExtensionOptions) {
  const commandsRef = useLatest(commands);
  const onSelectCommandRef = useLatest(onSelectCommand);

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
        items: ({ query }) => filterCommandItems(commandsRef.current, query),
        command: ({ editor, range, props }) => {
          onSelectCommandRef.current({
            command: props,
            editor,
            range,
          });
        },
        render: () => {
          let component: ReactRenderer<
            React.ComponentProps<typeof SuggestionsPanel> & {
              items: CommandItem[];
            }
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
            const floatingReference =
              getFloatingReference?.() ??
              ({
                getBoundingClientRect: () =>
                  posToDOMRect(
                    props.editor.view,
                    props.editor.state.selection.from,
                    props.editor.state.selection.to,
                  ),
              } satisfies VirtualElement);
            const referenceRect = floatingReference.getBoundingClientRect();
            const viewportPadding = 16;
            const verticalGap = 10;
            const panelMaxHeight = 220;
            const minPanelWidth = 260;
            const panelWidth = Math.min(
              Math.max(referenceRect.width, minPanelWidth),
              window.innerWidth - viewportPadding * 2,
            );

            floatingElement.style.position = "fixed";
            floatingElement.style.width = `${panelWidth}px`;
            floatingElement.style.maxHeight = `${panelMaxHeight}px`;

            const floatingRect = floatingElement.getBoundingClientRect();
            const availableAbove = referenceRect.top - viewportPadding - verticalGap;
            const availableBelow =
              window.innerHeight - referenceRect.bottom - viewportPadding - verticalGap;
            const shouldPlaceBelow =
              availableAbove < floatingRect.height && availableBelow > availableAbove;
            const nextLeft = Math.min(
              Math.max(referenceRect.left, viewportPadding),
              window.innerWidth - floatingRect.width - viewportPadding,
            );
            const maxHeight = Math.max(
              80,
              Math.min(panelMaxHeight, shouldPlaceBelow ? availableBelow : availableAbove),
            );

            floatingElement.style.left = `${nextLeft}px`;
            floatingElement.style.maxHeight = `${maxHeight}px`;

            if (shouldPlaceBelow) {
              floatingElement.style.top = `${referenceRect.bottom + verticalGap}px`;
              floatingElement.style.bottom = "auto";
              return;
            }

            floatingElement.style.top = "auto";
            floatingElement.style.bottom = `${window.innerHeight - referenceRect.top + verticalGap}px`;
          };

          const renderPopup = () => {
            if (!component || !latestProps) {
              return;
            }

            const props = latestProps;

            component.updateProps({
              items: commandsRef.current,
              query: props.query,
              selectedIndex,
              onSelect: (item) => props.command(item),
              onHighlight: (index) => {
                selectedIndex = index;
                renderPopup();
              },
              maxHeight: 220,
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
                  items: commandsRef.current,
                  query: props.query,
                  selectedIndex,
                  onSelect: (item) => props.command(item),
                  onHighlight: () => {},
                  maxHeight: 220,
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
  }, [getFloatingReference]);
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

interface VirtualElement {
  getBoundingClientRect: () => DOMRect;
}
