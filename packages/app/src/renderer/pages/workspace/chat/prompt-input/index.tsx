import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { EditorContent } from "@tiptap/react";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { INSERT_PROMPT_TEXT_EVENT } from "../prompt-insert-event";
import type { PromptSubmission } from "../prompt-types";
import { useChatEditor } from "../use-chat-editor";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";

interface PromptInputProps {
  disabled?: boolean;
  isRunning?: boolean;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
}

type PromptInputMode = "prompt" | "steer" | "followup";
export function PromptInput({
  disabled = false,
  isRunning = false,
  onFollowUp,
  onSteer,
  onSubmit,
  onStop,
  sessionId,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector();

  const permissionSelectorProps = usePermissionSelector(sessionId);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const { editor, hasContent } = useChatEditor({
    disabled,
    getFloatingReference: () => editorContainerRef.current,
  });

  useEffect(() => {
    if (!editor || !sessionId) return;

    const handleInsertPromptText = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string; text: string }>).detail;
      if (!detail || detail.sessionId !== sessionId || !detail.text) return;

      editor.chain().focus().insertContentAt(editor.state.doc.content.size, detail.text).run();
    };

    window.addEventListener(INSERT_PROMPT_TEXT_EVENT, handleInsertPromptText);
    return () => window.removeEventListener(INSERT_PROMPT_TEXT_EVENT, handleInsertPromptText);
  }, [editor, sessionId]);

  const canSubmitPrompt =
    !disabled && !isRunning && hasContent && modelSelectorProps.value !== null;
  const canSubmitPendingPrompt =
    !disabled && isRunning && hasContent && modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSubmit = useCallback(
    async (submitMode: PromptInputMode = "prompt") => {
      const canSubmit = submitMode === "prompt" ? canSubmitPrompt : canSubmitPendingPrompt;
      if (!canSubmit || !modelSelectorProps.value || !editor) {
        return;
      }

      const jsonContent = editor.getJSON();
      const submissionText = editor.getText({ blockSeparator: "\n" }).trim();
      if (!submissionText) {
        return;
      }

      const submission = {
        text: submissionText,
        jsonContent,
        model: modelSelectorProps.value,
        skillIds: getSelectedCommandIds(editor),
      };

      if (submitMode === "steer" && onSteer) {
        await onSteer(submission);
      } else if (submitMode === "followup" && onFollowUp) {
        await onFollowUp(submission);
      } else {
        await onSubmit(submission);
      }

      editor.commands.clearContent();
    },
    [
      canSubmitPrompt,
      canSubmitPendingPrompt,
      editor,
      modelSelectorProps.value,
      onFollowUp,
      onSteer,
      onSubmit,
    ],
  );

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Enter" || event.isComposing) {
        return;
      }

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;

      if (suggestionState?.active) {
        return;
      }

      if (isRunning) {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          void handleSubmit("steer");
          return;
        }

        if (event.shiftKey || event.altKey) {
          return;
        }

        event.preventDefault();
        void handleSubmit("followup");
        return;
      }

      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      event.preventDefault();
      void handleSubmit("prompt");
    };

    container.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      container.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [editor, handleSubmit, isRunning]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
        disabled && "opacity-80",
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

              void handleSubmit("prompt");
            }}
            disabled={isRunning ? !isStopEnabled : !canSubmitPrompt}
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
