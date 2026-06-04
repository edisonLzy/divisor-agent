import {
  useSlashCommandsExtension,
  getSelectedCommandIds,
} from "@renderer/components/richtext/extensions/slash-commands";
import type { CommandItem } from "@renderer/components/richtext/types";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { PromptSubmission } from "../prompt-types";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";
import { useAgentSkills } from "./use-agent-skills";

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
  const skills = useAgentSkills();
  const [hasContent, setHasContent] = useState(false);
  const suggestionOpenRef = useRef(false);
  const skipNextSubmitRef = useRef(false);
  const canSubmit = !disabled && !isRunning && hasContent && modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const slashCommands = useMemo<CommandItem[]>(
    () =>
      skills.map((skill) => ({
        id: skill.id,
        group: "Skills",
        name: skill.name,
        description: skill.description,
        extra: skill.scope === "user" ? "个人" : skill.scope === "project" ? "项目" : "系统",
      })),
    [skills],
  );

  const slashCommandsExtension = useSlashCommandsExtension({
    commands: slashCommands,
    onOpenChange: (isOpen) => {
      suggestionOpenRef.current = isOpen;
    },
    onSelectCommand: () => {
      skipNextSubmitRef.current = true;
    },
  });

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
      slashCommandsExtension,
    ],
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-[48px] max-h-[160px] overflow-y-auto text-[14px] leading-6 text-foreground caret-foreground outline-none",
      },
    },
    editable: !(disabled || isRunning),
    onUpdate: ({ editor: nextEditor }) => {
      setHasContent(nextEditor.getText().trim().length > 0);
    },
  });

  const handleSubmitRef = useRef<() => Promise<void> | void>(async () => {});

  handleSubmitRef.current = async () => {
    if (!canSubmit || !modelSelectorProps.value || !editor) {
      return;
    }

    const text = editor.getText().trim();
    if (!text) {
      return;
    }

    await onSubmit({
      text,
      model: modelSelectorProps.value,
      skillIds: getSelectedCommandIds(editor),
    });

    editor.commands.clearContent();
    setHasContent(false);
  };

  useEffect(() => {
    editor?.setEditable(!(disabled || isRunning));
  }, [disabled, editor, isRunning]);

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
        void handleSubmitRef.current();
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", handleKeyDown);

    return () => {
      dom.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
        disabled && !isRunning && "opacity-80",
      )}
    >
      <div className="relative min-h-14 px-3.5 py-2.5">
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

              void handleSubmitRef.current();
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
