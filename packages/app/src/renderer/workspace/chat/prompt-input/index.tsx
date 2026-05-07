import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import { ArrowUp } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { PromptSubmission } from "../prompt-types";
import { ModalSelector, useModalSelector } from "./ModalSelector";
import { type FileItem, PromptEditor, type PromptEditorHandle } from "./prompt-editor";

interface PromptInputProps {
  disabled?: boolean;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
}

export function PromptInput({ disabled = false, onSubmit }: PromptInputProps) {
  const { invoke } = useElectronIPC();
  const modelSelectorProps = useModalSelector();
  const editorRef = useRef<PromptEditorHandle>(null);
  const [hasContent, setHasContent] = useState(false);

  const canSubmit = !disabled && hasContent && modelSelectorProps.value !== null;

  const handleSearchFiles = useCallback(
    async (query: string): Promise<FileItem[]> => {
      const files = await invoke("searchWorkspaceFiles", query);
      return files.map((file) => ({
        id: file.path,
        label: file.path,
        name: file.name,
        path: file.path,
      }));
    },
    [invoke],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !modelSelectorProps.value || !editorRef.current) {
      return;
    }

    const text = editorRef.current.getText().trim();
    if (!text) return;

    await onSubmit({
      text,
      model: modelSelectorProps.value,
    });
    editorRef.current.clear();
    setHasContent(false);
  }, [canSubmit, modelSelectorProps.value, onSubmit]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42_/_0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0_/_0.28)]",
        disabled && "opacity-80",
      )}
    >
      {/* Input area */}
      <PromptEditor
        ref={editorRef}
        disabled={disabled}
        onSubmit={handleSubmit}
        onContentChange={setHasContent}
        onSearchFiles={handleSearchFiles}
        className="min-h-14"
      />

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="pl-1 text-[11px] text-muted-foreground sm:text-xs">
          Type @ to mention files
        </span>

        <div className="ml-auto flex items-center gap-2">
          <ModalSelector {...modelSelectorProps} />

          <Button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            size="icon-sm"
            className="size-8 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
            aria-label="Send prompt"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
