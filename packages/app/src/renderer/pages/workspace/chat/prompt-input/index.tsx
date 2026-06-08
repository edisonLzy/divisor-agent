import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
  type SlashCommandSelection,
  useSlashCommandsExtension,
} from "@renderer/components/richtext/extensions/slash-commands";
import { insertSkillNode, skillNode } from "@renderer/components/richtext/inline/skill-node";
import type { CommandItem } from "@renderer/components/richtext/types";
import { Button } from "@renderer/components/ui/button";
import { useAgentSkills } from "@renderer/hooks/use-agent-skills";
import { cn } from "@renderer/lib/utils";
import { Extension, type AnyExtension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Square } from "lucide-react";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PromptSubmission } from "../prompt-types";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";

interface PromptInputProps {
  disabled?: boolean;
  isRunning?: boolean;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
}

export function PromptInput({
  disabled = false,
  isRunning = false,
  onSubmit,
  onStop,
  sessionId,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector();
  const permissionSelectorProps = usePermissionSelector(sessionId);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const slashCommands = useSkillsCommandItems();
  const getFloatingReference = useCallback(() => editorContainerRef.current, []);
  const handleSelectCommand = useCallback(({ command, editor, range }: SlashCommandSelection) => {
    if (command.group === "Skills") {
      insertSkillNode({
        editor,
        range,
        skill: {
          id: command.id,
          label: command.name,
        },
      });
    }
  }, []);
  const slashCommandsExtension = useSlashCommandsExtension({
    commands: slashCommands,
    getFloatingReference,
    onSelectCommand: handleSelectCommand,
  });
  const promptExtensions = useMemo(
    () => [slashCommandsExtension, ghostSuggestionExtension],
    [slashCommandsExtension],
  );
  const editor = usePromptInputEditor({
    disabled: disabled || isRunning,
    extensions: promptExtensions,
    onContentChange: setHasContent,
  });
  const canSubmit = !disabled && !isRunning && hasContent && modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !modelSelectorProps.value || !editor) {
      return;
    }

    const jsonContent = editor.getJSON();
    const submissionText = editor.getText({ blockSeparator: "\n" }).trim();
    if (!submissionText) {
      return;
    }

    await onSubmit({
      text: submissionText,
      jsonContent,
      model: modelSelectorProps.value,
      skillIds: getSelectedCommandIds(editor),
    });

    editor.commands.clearContent();
    setHasContent(false);
  }, [canSubmit, editor, modelSelectorProps.value, onSubmit]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Enter" ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing
      ) {
        return;
      }

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;

      if (suggestionState?.active) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      void handleSubmit();
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, handleSubmit]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
        disabled && !isRunning && "opacity-80",
      )}
    >
      <div ref={editorContainerRef} className="relative min-h-14 px-3.5 py-2.5">
        <EditorContent editor={editor} className="prompt-editor max-w-none" />
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <PermissionSelector {...permissionSelectorProps} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <ModalSelector {...modelSelectorProps} />

          <Button
            type="button"
            onClick={() => {
              if (isRunning) {
                void onStop?.();
                return;
              }

              void handleSubmit();
            }}
            disabled={isRunning ? !isStopEnabled : !canSubmit}
            size="icon-sm"
            className={cn(
              "size-7 rounded-full transition-colors disabled:bg-muted disabled:text-muted-foreground/50",
              isRunning
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30",
            )}
            aria-label={isRunning ? "Stop response" : "Send prompt"}
          >
            {isRunning ? (
              <Square className="size-3" fill="currentColor" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function usePromptInputEditor({
  disabled,
  extensions = [],
  onContentChange,
}: {
  disabled: boolean;
  extensions?: AnyExtension[];
  onContentChange: (hasContent: boolean) => void;
}) {
  const editor = useEditor(
    {
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
        ...extensions,
        skillNode,
      ],
      editorProps: {
        attributes: {
          class:
            "ProseMirror min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground outline-none",
        },
      },
      editable: !disabled,
      onUpdate: ({ editor: nextEditor }) => {
        onContentChange(nextEditor.getText().trim().length > 0);
      },
    },
    [extensions],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return editor;
}

const GHOST_SUGGESTIONS = [
  "fix the failing tests",
  "explain this code path",
  "implement this feature and run type-check",
  "review the recent changes",
  "summarize this repository",
  "create a small refactor plan",
];

const ghostSuggestionPluginKey = new PluginKey<{ suffix: string }>("promptGhostSuggestion");

const ghostSuggestionExtension = Extension.create({
  name: "promptGhostSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostSuggestionPluginKey,
        state: {
          init: (_, state) => ({ suffix: getGhostSuggestionSuffix(state.doc.textContent) }),
          apply: (_, _value, _oldState, newState) => ({
            suffix: getGhostSuggestionSuffix(newState.doc.textContent),
          }),
        },
        props: {
          decorations(state) {
            const pluginState = ghostSuggestionPluginKey.getState(state);

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

            const pluginState = ghostSuggestionPluginKey.getState(view.state);

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

function useSkillsCommandItems() {
  const skills = useAgentSkills();

  return useMemo<CommandItem[]>(
    () =>
      skills
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          id: skill.id,
          group: "Skills",
          name: skill.name,
          description: skill.description,
          extra: skill.scope === "user" ? "个人" : skill.scope === "project" ? "项目" : "系统",
        })),
    [skills],
  );
}
