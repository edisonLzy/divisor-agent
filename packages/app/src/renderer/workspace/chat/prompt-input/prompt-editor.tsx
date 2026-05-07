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
}

function FileSuggestionPopup({
  items,
  selectedIndex,
  command,
  onHighlight,
}: FileSuggestionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="w-80 rounded-xl border border-border bg-popover p-3 text-sm text-muted-foreground shadow-xl">
        No files found
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="w-80 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "text-popover-foreground hover:bg-muted",
          )}
          onClick={() => command(item)}
          onMouseEnter={() => onHighlight(index)}
        >
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{item.name}</span>
          <span className="ml-auto truncate text-xs text-muted-foreground">{item.path}</span>
        </button>
      ))}
    </div>
  );
}

// ── Suggestion configuration ────────────────────────────────────────────────

function createSuggestion(
  onSearch: (query: string) => FileItem[] | Promise<FileItem[]>,
): Omit<SuggestionOptions<FileItem>, "editor"> {
  return {
    char: "@",
    allowSpaces: true,
    startOfLine: false,
    items: ({ query }) => onSearch(query),
    render: () => {
      let popupEl: HTMLDivElement | null = null;
      let root: Root | null = null;
      let selectedIndex = 0;
      let currentItemsKey = "";
      let latestProps: {
        items: FileItem[];
        command: (item: FileItem) => void;
        clientRect?: (() => DOMRect | null) | null;
      } | null = null;

      function updatePopup(props: {
        items: FileItem[];
        command: (item: FileItem) => void;
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

        const rect = props.clientRect?.();
        if (rect) {
          popupEl.style.left = `${rect.left}px`;
          popupEl.style.top = `${rect.bottom + 4}px`;
          popupEl.style.display = "block";
        }

        root.render(
          <FileSuggestionPopup
            items={props.items}
            selectedIndex={selectedIndex}
            command={props.command}
            onHighlight={(index) => {
              selectedIndex = index;
              if (latestProps) {
                updatePopup(latestProps);
              }
            }}
          />,
        );
      }

      return {
        onStart: (props) => {
          popupEl = document.createElement("div");
          popupEl.dataset.suggestion = "files";
          popupEl.style.position = "fixed";
          popupEl.style.zIndex = "50";
          document.body.appendChild(popupEl);

          root = createRoot(popupEl);
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
            if (popupEl) {
              popupEl.style.display = "none";
            }
            return true;
          }

          return false;
        },
        onExit: () => {
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
        suggestion: createSuggestion(handleSearchFiles),
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

    const observer = new MutationObserver(() => {
      // no-op: observer kept for cleanup symmetry
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing
      ) {
        const hasSuggestionPopup = document.querySelector("[data-suggestion]");
        if (hasSuggestionPopup) return;

        event.preventDefault();
        onSubmitRef.current();
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", handleKeyDown);
    return () => {
      dom.removeEventListener("keydown", handleKeyDown);
      observer.disconnect();
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
