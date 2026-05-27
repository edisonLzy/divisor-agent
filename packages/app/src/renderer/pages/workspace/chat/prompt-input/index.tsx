import { Button } from "@renderer/components/ui/button";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import { ArrowUp, ChevronDown, Hand, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import type { PromptSubmission } from "../prompt-types";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { type FileItem, PromptEditor, type PromptEditorHandle } from "./prompt-editor";

interface PromptInputProps {
  disabled?: boolean;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  sessionId: string | null;
}

export function PromptInput({ disabled = false, onSubmit, sessionId }: PromptInputProps) {
  const { invoke } = useElectronIPC();
  const modelSelectorProps = useModalSelector();
  const editorRef = useRef<PromptEditorHandle>(null);
  const [hasContent, setHasContent] = useState(false);
  const canSubmit = !disabled && hasContent && modelSelectorProps.value !== null;

  const handleSearchFiles = useCallback(
    async (query: string): Promise<FileItem[]> => {
      if (!sessionId) {
        return [];
      }

      const files = await invoke("searchWorkspaceFiles", sessionId, query);
      return files.map((file) => ({
        id: file.path,
        label: file.path,
        name: file.name,
        path: file.path,
      }));
    },
    [invoke, sessionId],
  );

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
    });

    editorRef.current.clear();
    setHasContent(false);
  }, [canSubmit, modelSelectorProps.value, onSubmit]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
        disabled && "opacity-80",
      )}
    >
      <PromptEditor
        ref={editorRef}
        disabled={disabled}
        onSubmit={handleSubmit}
        onContentChange={setHasContent}
        onSearchFiles={handleSearchFiles}
        className="min-h-14"
      />

      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7 rounded-sm hover:bg-muted"
            aria-label="Add attachment"
          >
            <Plus className="size-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-sm px-2 text-xs font-normal hover:bg-muted"
          >
            <Hand className="size-3.5" />
            <span>默认权限</span>
            <ChevronDown className="size-3" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ModalSelector {...modelSelectorProps} />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-sm px-2 text-xs font-normal hover:bg-muted"
          >
            <span>自定义 中</span>
            <ChevronDown className="size-3" />
          </Button>

          <Button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            size="icon-sm"
            className="size-7 rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30 disabled:bg-muted disabled:text-muted-foreground/50"
            aria-label="Send prompt"
          >
            <ArrowUp className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
