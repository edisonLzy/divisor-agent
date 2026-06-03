import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { PromptSubmission } from "../prompt-types";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";
import { PromptEditor, type PromptEditorHandle } from "./prompt-editor";

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
  const editorRef = useRef<PromptEditorHandle>(null);
  const [hasContent, setHasContent] = useState(false);
  const canSubmit = !disabled && !isRunning && hasContent && modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !modelSelectorProps.value || !editorRef.current) {
      return;
    }

    const text = editorRef.current.getText().trim();
    if (!text) {
      return;
    }

    await onSubmit({
      text,
      model: modelSelectorProps.value,
      skillIds: editorRef.current.getSelectedSkillIds(),
    });

    editorRef.current.clear();
    setHasContent(false);
  }, [canSubmit, modelSelectorProps.value, onSubmit]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
        disabled && !isRunning && "opacity-80",
      )}
    >
      <PromptEditor
        ref={editorRef}
        disabled={disabled || isRunning}
        onSubmit={handleSubmit}
        onContentChange={setHasContent}
        className="min-h-14"
      />

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
