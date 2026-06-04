import {
  filterCommandItems,
  SuggestionsPanel,
} from "@renderer/components/richtext/components/suggestions-panel";
import type { CommandItem } from "@renderer/components/richtext/types";
import Mention from "@tiptap/extension-mention";
import type { Editor } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "prosemirror-state";
import { useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

interface UseSlashCommandsExtensionOptions {
  commands: CommandItem[];
  onSelectCommand: (command: CommandItem) => void;
  onOpenChange?: (isOpen: boolean) => void;
}

export function useSlashCommandsExtension({
  commands,
  onSelectCommand,
  onOpenChange,
}: UseSlashCommandsExtensionOptions) {
  const commandsRef = useRef(commands);
  const onSelectCommandRef = useRef(onSelectCommand);
  const onOpenChangeRef = useRef(onOpenChange);

  commandsRef.current = commands;
  onSelectCommandRef.current = onSelectCommand;
  onOpenChangeRef.current = onOpenChange;

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
      suggestion: createSlashCommandSuggestion(() => commandsRef.current, {
        onOpenChange: (isOpen) => onOpenChangeRef.current?.(isOpen),
        onSelectCommand: (command) => onSelectCommandRef.current(command),
      }),
    });
  }, []);
}

function createSlashCommandSuggestion(
  getCommands: () => CommandItem[],
  callbacks: {
    onOpenChange?: (isOpen: boolean) => void;
    onSelectCommand: (command: CommandItem) => void;
  },
): Omit<SuggestionOptions<CommandItem>, "editor"> {
  const popupGap = 8;
  const viewportMargin = 16;
  const maxPopupHeight = 360;
  const minPopupHeight = 140;
  const popupWidth = 920;

  return {
    char: "/",
    allowSpaces: true,
    startOfLine: false,
    pluginKey: new PluginKey("slashCommandSuggestion"),
    decorationClass: "file-suggestion-query",
    decorationContent: "search slash commands",
    decorationEmptyClass: "is-empty",
    items: ({ query }) => filterCommandItems(getCommands(), query),
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "slashCommandMention",
            attrs: {
              id: props.id,
              label: props.name,
            },
          },
          { type: "text", text: " " },
        ])
        .run();

      callbacks.onSelectCommand(props);
    },
    render: () => {
      let popupElement: HTMLDivElement | null = null;
      let root: Root | null = null;
      let selectedIndex = 0;
      let currentItemsKey = "";
      let popupMaxHeight = maxPopupHeight;
      let rafId: number | null = null;
      let latestProps: {
        items: CommandItem[];
        command: (item: CommandItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      } | null = null;

      function renderPopup() {
        if (!root || !latestProps) {
          return;
        }

        root.render(
          <SuggestionsPanel
            items={getCommands()}
            query={latestProps.query}
            selectedIndex={selectedIndex}
            onSelect={(item) => latestProps?.command(item)}
            onHighlight={(index) => {
              selectedIndex = index;
              renderPopup();
            }}
            maxHeight={popupMaxHeight}
          />,
        );
      }

      function positionPopup() {
        if (!popupElement || !latestProps) {
          return;
        }

        const rect = latestProps.clientRect?.();
        if (!rect) {
          return;
        }

        const resolvedPopupWidth = Math.min(popupWidth, window.innerWidth - viewportMargin * 2);
        const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
        const spaceAbove = rect.top - viewportMargin;

        popupElement.style.width = `${resolvedPopupWidth}px`;
        popupElement.style.display = "block";

        const measuredHeight = popupElement.offsetHeight || maxPopupHeight;
        const shouldFlip =
          spaceBelow < Math.min(measuredHeight, maxPopupHeight) + popupGap &&
          spaceAbove > spaceBelow;
        const availableSpace = shouldFlip ? spaceAbove : spaceBelow;

        popupMaxHeight = Math.max(minPopupHeight, Math.min(availableSpace, maxPopupHeight));
        renderPopup();

        const finalHeight = popupElement.offsetHeight || popupMaxHeight;
        const left = Math.max(
          viewportMargin,
          Math.min(rect.left, window.innerWidth - resolvedPopupWidth - viewportMargin),
        );
        const top = shouldFlip
          ? Math.max(viewportMargin, rect.top - finalHeight - popupGap)
          : Math.min(window.innerHeight - viewportMargin - finalHeight, rect.bottom + popupGap);

        popupElement.style.left = `${left}px`;
        popupElement.style.top = `${top}px`;
      }

      function schedulePosition() {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }

        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          positionPopup();
        });
      }

      function updatePopup(props: {
        items: CommandItem[];
        command: (item: CommandItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      }) {
        latestProps = props;

        if (!popupElement || !root) {
          return;
        }

        const nextItemsKey = props.items.map((item) => item.id).join("\n");
        if (nextItemsKey !== currentItemsKey) {
          currentItemsKey = nextItemsKey;
          selectedIndex = 0;
        }

        if (props.items.length > 0) {
          selectedIndex = Math.min(selectedIndex, props.items.length - 1);
        }

        renderPopup();
        schedulePosition();
      }

      return {
        onStart: (props) => {
          popupElement = document.createElement("div");
          popupElement.dataset.suggestion = "slash-commands";
          popupElement.style.position = "fixed";
          popupElement.style.zIndex = "50";
          popupElement.style.pointerEvents = "auto";
          document.body.appendChild(popupElement);

          root = createRoot(popupElement);
          callbacks.onOpenChange?.(true);

          window.addEventListener("resize", schedulePosition);
          window.addEventListener("scroll", schedulePosition, true);

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
            if (popupElement) {
              popupElement.style.display = "none";
            }
            return true;
          }

          return false;
        },
        onExit: () => {
          callbacks.onOpenChange?.(false);
          window.removeEventListener("resize", schedulePosition);
          window.removeEventListener("scroll", schedulePosition, true);

          if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
          }

          root?.unmount();
          root = null;
          popupElement?.remove();
          popupElement = null;
        },
      };
    },
  };
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

    if (node.type === "slashCommandMention" && typeof node.attrs?.id === "string") {
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
