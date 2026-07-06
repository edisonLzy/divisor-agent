import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import { Progress } from "@renderer/components/ui/progress";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { estimateDraftTokens, formatTokenCount, summarizeUsage } from "@renderer/lib/token-usage";
import { cn } from "@renderer/lib/utils";
import type { EntryState } from "@renderer/store/entries-slice";
import type { AvailableModel } from "@shared/models-ipc";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { EditorContent } from "@tiptap/react";
import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { INSERT_PROMPT_TEXT_EVENT } from "../prompt-insert-event";
import type { PromptSubmission } from "../prompt-types";
import { useChatEditor, UseChatEditorOptions } from "../use-chat-editor";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";

export interface PromptInputProps extends Pick<UseChatEditorOptions, "onCreate" | "onDestroy"> {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
  getEntryState: (sessionId: string) => EntryState;
}

export function PromptInput({
  disabled = false,
  initialModel = null,
  isRunning = false,
  onSubmit,
  onSteer,
  onFollowUp,
  onStop,
  onCreate,
  onDestroy,
  sessionId,
  getEntryState,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector(initialModel);

  const permissionSelectorProps = usePermissionSelector(sessionId);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const { editor, hasContent, text } = useChatEditor({
    // Note: we intentionally do NOT include `isRunning` in `disabled` so the user
    // can type steer/follow-up prompts while the agent is processing.
    disabled,
    getFloatingReference: () => editorContainerRef.current,
    onCreate,
    onDestroy,
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

  const hasModel = modelSelectorProps.value !== null;
  const isStopEnabled = isRunning && typeof onStop === "function";

  const handleSubmit = useCallback(
    async (kind: AppUserMessage["kind"] = "prompt") => {
      if (disabled || !hasContent || !hasModel || !editor) {
        return;
      }

      const jsonContent = editor.getJSON();
      const submissionText = editor.getText({ blockSeparator: "\n" }).trim();
      if (!submissionText) {
        return;
      }

      const submission: PromptSubmission = {
        content: submissionText,
        jsonContent,
        model: modelSelectorProps.value!,
        skillIds: getSelectedCommandIds(editor),
      };

      if (kind === "steering") {
        onSteer?.(submission);
      } else if (kind === "follow-up" && onFollowUp) {
        onFollowUp(submission);
      } else {
        onSubmit(submission);
      }

      editor.commands.clearContent();
    },
    [
      disabled,
      editor,
      hasContent,
      hasModel,
      modelSelectorProps.value,
      onFollowUp,
      onSteer,
      onSubmit,
    ],
  );

  // Listen for Enter / Mod+Enter on the editor container with `capture: true`
  // so the handler runs BEFORE TipTap's own Enter handler. This guarantees
  // `event.preventDefault()` blocks the newline insertion.
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (!matchesKeyboardEvent(event, "Enter") && !matchesKeyboardEvent(event, "Mod+Enter"))
      ) {
        return;
      }

      const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
      if (suggestionState?.active) {
        return;
      }

      if (isRunning) {
        if (matchesKeyboardEvent(event, "Mod+Enter")) {
          event.preventDefault();
          void handleSubmit("follow-up");
        }

        if (matchesKeyboardEvent(event, "Enter")) {
          event.preventDefault();
          void handleSubmit("steering");
        }
        return;
      }

      event.preventDefault();
      void handleSubmit("prompt");
    };

    container.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      container.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [editor, handleSubmit, isRunning, onFollowUp]);

  const canSubmit = !disabled && !isRunning && hasContent && hasModel;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col rounded-lg border-2 border-border bg-card shadow-[var(--hard-shadow)] transition-all duration-200 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
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
          <ContextUsageControl
            draftText={text}
            model={modelSelectorProps.value}
            sessionId={sessionId}
            getEntryState={getEntryState}
          />

          <ModalSelector {...modelSelectorProps} />

          <Button
            type="button"
            onClick={() => {
              if (isRunning) {
                if (isStopEnabled) void onStop?.();
                return;
              }

              void handleSubmit();
            }}
            disabled={isRunning ? !isStopEnabled : !canSubmit}
            size="icon-sm"
            className={cn(
              "size-7 rounded-md border-2 border-border shadow-[var(--hard-shadow-sm)] transition-all disabled:bg-muted disabled:text-muted-foreground/50 disabled:shadow-none",
              isRunning
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "bg-accent text-accent-foreground hover:translate-x-px hover:translate-y-px hover:bg-accent hover:shadow-none",
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

interface ContextUsageControlProps {
  draftText: string;
  model: AvailableModel | null;
  sessionId: string | null;
  getEntryState: (sessionId: string) => EntryState;
}

function ContextUsageControl({
  draftText,
  model,
  sessionId,
  getEntryState,
}: ContextUsageControlProps) {
  const [open, setOpen] = useState(false);

  if (!sessionId || !model) return null;

  const entryState = getEntryState(sessionId);
  const assistantMessages = entryState.entries
    .filter(isAgentMessageEntry)
    .flatMap((entry) => (entry.data.role === "assistant" ? [entry.data] : []));
  const { sessionUsage } = summarizeUsage(assistantMessages);
  // Ring fill: the most recent request's input side. Since entry.usage accumulates
  // across all LLM calls in a turn, we use the last entry's input-side tokens
  // (input + cacheRead + cacheWrite). The Math.min clamp on the ring caps it at
  // 100% even when accumulated tokens exceed contextWindow.
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const lastRequestInputTokens = lastAssistant
    ? lastAssistant.usage.input + lastAssistant.usage.cacheRead + lastAssistant.usage.cacheWrite
    : 0;
  const draftTokens = estimateDraftTokens(draftText);
  const measuredTokens = lastRequestInputTokens;
  const contextWindow = model.contextWindow || 128_000;
  const usedTokens = Math.min(contextWindow, measuredTokens + draftTokens);
  const usageRatio = contextWindow > 0 ? usedTokens / contextWindow : 0;
  const usagePercentage = Math.min(100, Math.round(usageRatio * 100));
  // Signal-token thresholds (spec §3): cyan = healthy/info, yellow = approaching,
  // destructive = critical. No chart-* tokens (grayscale) or decorative gradients.
  const ringColor =
    usageRatio >= 0.85
      ? "var(--destructive)"
      : usageRatio >= 0.65
        ? "var(--signal-yellow)"
        : "var(--signal-cyan)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`上下文窗口已使用 ${usagePercentage}%`}
        className="flex h-7 items-center gap-1.5 rounded-sm border-2 border-border bg-card px-2 text-muted-foreground shadow-[var(--hard-shadow-sm)] transition-all hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 data-popup-open:bg-accent"
      >
        <span
          className="flex size-[14px] items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ringColor} ${usagePercentage}%, var(--muted) 0)`,
          }}
        >
          <span className="size-2 rounded-full bg-card" />
        </span>
        <span className="font-mono text-[11px] tabular-nums">{usagePercentage}%</span>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={10}
        className="w-80 rounded-md border-2 border-border bg-popover p-4 shadow-[var(--hard-shadow)]"
      >
        <PopoverHeader>
          <PopoverDescription>上下文窗口</PopoverDescription>
          <div className="flex items-baseline gap-1.5">
            <PopoverTitle className="font-mono text-lg tabular-nums">
              {formatTokenCount(usedTokens)}
            </PopoverTitle>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              / {formatTokenCount(contextWindow)} tokens
            </span>
          </div>
        </PopoverHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              剩余约 {formatTokenCount(Math.max(0, contextWindow - usedTokens))} tokens
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {usagePercentage}%
            </span>
          </div>
          <Progress value={usagePercentage} />
          <p
            className={cn(
              "m-0 text-[10px] text-muted-foreground",
              usageRatio >= 0.85 && "text-destructive",
            )}
          >
            {getContextStatusMessage(usageRatio)}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            Session 总消耗{" "}
            <span className="font-mono tabular-nums">
              {formatTokenCount(sessionUsage.totalTokens)}
            </span>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getContextStatusMessage(usageRatio: number): string {
  if (usageRatio >= 0.95) return "上下文即将用尽，建议开启新会话。";
  if (usageRatio >= 0.85) return "上下文使用较高，长任务可能需要压缩历史。";
  if (usageRatio >= 0.65) return "上下文接近提醒阈值，当前仍可继续。";
  return "上下文空间充足，可继续当前任务。";
}
