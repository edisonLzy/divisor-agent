import { cn } from "@renderer/lib/utils";
import type { DiscoveredSkill } from "@shared/skills-ipc";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { PluginKey } from "@tiptap/pm/state";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionOptions } from "@tiptap/suggestion";
import { BoxIcon } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(function PromptEditor(
  { disabled = false, onSubmit, onContentChange, onSearchSkills, className },
  ref,
) {
  const editorRef = useRef<Editor | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const suggestionOpenRef = useRef(false);
  const skipNextSubmitRef = useRef(false);

  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const handleSearchSkills = useCallback(
    (query: string) => onSearchSkills(query),
    [onSearchSkills],
  );

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
      SkillMention.configure({
        HTMLAttributes: {
          class:
            "inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-200",
        },
        renderText({ node, suggestion }) {
          return `${suggestion?.char ?? "/"}${node.attrs.label ?? node.attrs.id ?? ""}`;
        },
        suggestion: createSkillSuggestion(handleSearchSkills, {
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
          "ProseMirror min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground outline-none",
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

  useEffect(() => {
    if (!editor) {
      return;
    }

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
    getSelectedSkillIds: () => {
      return getSelectedSkillIds(editorRef.current);
    },
  }));

  return (
    <div className={cn("relative px-3.5 py-2.5", className)}>
      <EditorContent editor={editor} className="prompt-editor max-w-none" />
    </div>
  );
});

export interface SkillItem {
  id: string;
  label: string;
  name: string;
  description: string;
  scope: DiscoveredSkill["scope"];
}

export interface PromptEditorHandle {
  clear: () => void;
  getText: () => string;
  getEditor: () => Editor | null;
  getSelectedSkillIds: () => string[];
}

interface PromptEditorProps {
  disabled?: boolean;
  onSubmit: () => void;
  onContentChange?: (hasContent: boolean) => void;
  onSearchSkills: (query: string) => SkillItem[] | Promise<SkillItem[]>;
  className?: string;
}

interface SkillSuggestionPopupProps {
  items: SkillItem[];
  selectedIndex: number;
  command: (item: SkillItem) => void;
  onHighlight: (index: number) => void;
  maxHeight: number;
}

interface SuggestionLifecycleCallbacks {
  onOpenChange?: (isOpen: boolean) => void;
  onSelect?: () => void;
}

function SkillSuggestionPopup({
  items,
  selectedIndex,
  command,
  onHighlight,
  maxHeight,
}: SkillSuggestionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-border/80 bg-popover/95 px-4 py-3.5 text-sm text-muted-foreground shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]">
        No skills found
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="overflow-y-auto rounded-[20px] border border-border/80 bg-popover/95 p-2 shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]"
      style={{ maxHeight }}
    >
      <div className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Skills
      </div>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "text-popover-foreground hover:bg-muted",
          )}
          onClick={() => command(item)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlight(index)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
            <BoxIcon className="size-4 shrink-0" />
          </span>
          <span className="min-w-0 flex flex-1 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-current">{item.name}</span>
            <span className="truncate text-xs text-muted-foreground">{item.description}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{scopeLabel[item.scope]}</span>
        </button>
      ))}
    </div>
  );
}

const SkillMention = Mention.extend({
  name: "skillMention",
});

const scopeLabel: Record<DiscoveredSkill["scope"], string> = {
  system: "系统",
  project: "项目",
  user: "个人",
};

function createSkillSuggestion(
  onSearch: (query: string) => SkillItem[] | Promise<SkillItem[]>,
  callbacks: SuggestionLifecycleCallbacks,
): Omit<SuggestionOptions<SkillItem>, "editor"> {
  const popupGap = 8;
  const viewportMargin = 16;
  const maxPopupHeight = 360;
  const minPopupHeight = 140;
  const popupWidth = 920;

  return {
    char: "/",
    allowSpaces: true,
    startOfLine: false,
    pluginKey: new PluginKey("skillSuggestion"),
    decorationClass: "file-suggestion-query",
    decorationContent: "search skills",
    decorationEmptyClass: "is-empty",
    items: ({ query }) => onSearch(query),
    render: () => {
      let popupElement: HTMLDivElement | null = null;
      let root: Root | null = null;
      let selectedIndex = 0;
      let currentItemsKey = "";
      let popupMaxHeight = maxPopupHeight;
      let rafId: number | null = null;
      let latestProps: {
        items: SkillItem[];
        command: (item: SkillItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      } | null = null;

      function renderPopup() {
        if (!root || !latestProps) {
          return;
        }

        root.render(
          <SkillSuggestionPopup
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
        items: SkillItem[];
        command: (item: SkillItem) => void;
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
          popupElement.dataset.suggestion = "skills";
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
            if (latestProps) updatePopup(latestProps);
            return true;
          }

          if (props.event.key === "ArrowUp" && items.length > 0) {
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            if (latestProps) updatePopup(latestProps);
            return true;
          }

          if (props.event.key === "Enter" && items.length > 0) {
            callbacks.onSelect?.();
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

function getSelectedSkillIds(editor: Editor | null): string[] {
  const ids = new Set<string>();
  const doc = editor?.getJSON();

  function visit(
    node: { type?: string; attrs?: { id?: unknown }; content?: unknown[] } | undefined,
  ) {
    if (!node) {
      return;
    }

    if (node.type === "skillMention" && typeof node.attrs?.id === "string") {
      ids.add(node.attrs.id);
    }

    for (const child of node.content ?? []) {
      visit(child as { type?: string; attrs?: { id?: unknown }; content?: unknown[] });
    }
  }

  visit(doc);
  return Array.from(ids);
}
