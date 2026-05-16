import { cn } from "@renderer/lib/utils";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionOptions } from "@tiptap/suggestion";
import { FileIcon } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

// ── File item type ─────────────────────────────────────────────────────────

export interface FileItem {
  id: string;
  label: string;
  path: string;
  name: string;
}

// ── Suggestion popup ───────────────────────────────────────────────────────

interface FileSuggestionPopupProps {
  items: FileItem[];
  selectedIndex: number;
  command: (item: FileItem) => void;
  onHighlight: (index: number) => void;
  maxHeight: number;
}

function FileSuggestionPopup({
  items,
  selectedIndex,
  command,
  onHighlight,
  maxHeight,
}: FileSuggestionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-border/80 bg-popover/95 px-4 py-3.5 text-sm text-muted-foreground shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]">
        No files found
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="overflow-y-auto rounded-[20px] border border-border/80 bg-popover/95 p-2 shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]"
      style={{ maxHeight }}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "text-popover-foreground hover:bg-muted",
          )}
          onClick={() => command(item)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlight(index)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
            <FileIcon className="size-4 shrink-0" />
          </span>

          <span className="min-w-0 flex flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-current">{item.name}</span>
            <span className="truncate text-xs text-muted-foreground">{item.path}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Suggestion configuration ────────────────────────────────────────────────

interface SuggestionLifecycleCallbacks {
  onOpenChange?: (isOpen: boolean) => void;
  onSelect?: () => void;
}

function createSuggestion(
  onSearch: (query: string) => FileItem[] | Promise<FileItem[]>,
  callbacks: SuggestionLifecycleCallbacks,
): Omit<SuggestionOptions<FileItem>, "editor"> {
  const POPUP_GAP = 8;
  const VIEWPORT_MARGIN = 16;
  const MAX_POPUP_HEIGHT = 352;
  const MIN_POPUP_HEIGHT = 140;
  const POPUP_WIDTH = 760;

  return {
    char: "@",
    allowSpaces: true,
    startOfLine: false,
    decorationClass: "file-suggestion-query",
    decorationContent: "type to filter",
    decorationEmptyClass: "is-empty",
    items: ({ query }) => onSearch(query),
    render: () => {
      let popupEl: HTMLDivElement | null = null;
      let root: Root | null = null;
      let selectedIndex = 0;
      let currentItemsKey = "";
      let popupMaxHeight = MAX_POPUP_HEIGHT;
      let rafId: number | null = null;
      let latestProps: {
        items: FileItem[];
        command: (item: FileItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      } | null = null;

      function renderPopup() {
        if (!root || !latestProps) return;

        root.render(
          <FileSuggestionPopup
            items={latestProps.items}
            selectedIndex={selectedIndex}
            command={(item) => latestProps?.command(item)}
            maxHeight={popupMaxHeight}
            onHighlight={(index) => {
              selectedIndex = index;
              renderPopup();
            }}
          />,
        );
      }

      function positionPopup() {
        if (!popupEl || !latestProps) return;

        const rect = latestProps.clientRect?.();
        if (!rect) return;

        const popupWidth = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
        const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - VIEWPORT_MARGIN;

        popupEl.style.width = `${popupWidth}px`;
        popupEl.style.display = "block";

        const measuredHeight = popupEl.offsetHeight || MAX_POPUP_HEIGHT;
        const shouldFlip =
          spaceBelow < Math.min(measuredHeight, MAX_POPUP_HEIGHT) + POPUP_GAP &&
          spaceAbove > spaceBelow;
        const availableSpace = shouldFlip ? spaceAbove : spaceBelow;

        popupMaxHeight = Math.max(MIN_POPUP_HEIGHT, Math.min(availableSpace, MAX_POPUP_HEIGHT));
        renderPopup();

        const finalHeight = popupEl.offsetHeight || popupMaxHeight;
        const left = Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - popupWidth - VIEWPORT_MARGIN),
        );
        const top = shouldFlip
          ? Math.max(VIEWPORT_MARGIN, rect.top - finalHeight - POPUP_GAP)
          : Math.min(window.innerHeight - VIEWPORT_MARGIN - finalHeight, rect.bottom + POPUP_GAP);

        popupEl.dataset.side = shouldFlip ? "top" : "bottom";
        popupEl.style.left = `${left}px`;
        popupEl.style.top = `${top}px`;
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
        items: FileItem[];
        command: (item: FileItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      }) {
        latestProps = props;

        if (!popupEl || !root) return;

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
          popupEl = document.createElement("div");
          popupEl.dataset.suggestion = "files";
          popupEl.style.position = "fixed";
          popupEl.style.zIndex = "50";
          popupEl.style.pointerEvents = "auto";
          document.body.appendChild(popupEl);

          root = createRoot(popupEl);
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
            callbacks.onSelect?.();
            latestProps?.command(items[selectedIndex]);
            return true;
          }

          if (props.event.key === "Escape") {
            if (popupEl) {
              popupEl.style.display = "none";
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
          if (root) {
            root.unmount();
            root = null;
          }
          if (popupEl) {
            popupEl.remove();
            popupEl = null;
          }
        },
      };
    },
  };
}

// ── PromptEditor ────────────────────────────────────────────────────────────

export interface PromptEditorHandle {
  clear: () => void;
  getText: () => string;
  getEditor: () => Editor | null;
}

interface PromptEditorProps {
  disabled?: boolean;
  onSubmit: () => void;
  onContentChange?: (hasContent: boolean) => void;
  onSearchFiles: (query: string) => FileItem[] | Promise<FileItem[]>;
  className?: string;
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(function PromptEditor(
  { disabled = false, onSubmit, onContentChange, onSearchFiles, className },
  ref,
) {
  const editorRef = useRef<Editor | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const suggestionOpenRef = useRef(false);
  const skipNextSubmitRef = useRef(false);

  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const handleSearchFiles = useCallback((query: string) => onSearchFiles(query), [onSearchFiles]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
        bulletList: false,
      }),
      Placeholder.configure({
        placeholder: "Ask anything...",
      }),
      Mention.configure({
        HTMLAttributes: {
          class:
            "inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-accent-foreground font-medium text-sm",
        },
        renderText({ node, suggestion }) {
          return `${suggestion?.char ?? "@"}${node.attrs.label ?? node.attrs.id ?? ""}`;
        },
        suggestion: createSuggestion(handleSearchFiles, {
          onOpenChange: (isOpen) => {
            suggestionOpenRef.current = isOpen;
          },
          onSelect: () => {
            skipNextSubmitRef.current = true;
          },
        }),
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "outline-none min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground ProseMirror",
      },
    },
    editable: !disabled,
    onUpdate: ({ editor: nextEditor }) => {
      onContentChangeRef.current?.(nextEditor.getText().trim().length > 0);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Handle Enter to submit — check for tiptap suggestion popup in DOM
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing
      ) {
        if (skipNextSubmitRef.current) {
          skipNextSubmitRef.current = false;
          event.preventDefault();
          return;
        }

        if (suggestionOpenRef.current) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        onSubmitRef.current();
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", handleKeyDown);
    return () => {
      dom.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      editorRef.current?.commands.clearContent();
    },
    getText: () => {
      return editorRef.current?.getText() ?? "";
    },
    getEditor: () => editorRef.current,
  }));

  return (
    <div className={cn("relative px-3.5 py-2.5", className)}>
      <EditorContent editor={editor} className="prompt-editor max-w-none" />
    </div>
  );
});
