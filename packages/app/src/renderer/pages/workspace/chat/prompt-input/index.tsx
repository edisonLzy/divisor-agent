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
import { Separator } from "@renderer/components/ui/separator";
import { Spinner } from "@renderer/components/ui/spinner";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { estimateDraftTokens, formatPercentage, formatTokenCount } from "@renderer/lib/token-usage";
import type { SessionUsageSummary } from "@renderer/lib/token-usage";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import type { ContextUsageBreakdown, ContextUsageSnapshot } from "@shared/token-usage";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { EditorContent } from "@tiptap/react";
import {
  ArrowUp,
  ChevronRight,
  MessageSquareText,
  Settings2,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { INSERT_PROMPT_TEXT_EVENT } from "../prompt-insert-event";
import type { PromptSubmission } from "../prompt-types";
import { useChatEditor } from "../use-chat-editor";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";

interface PromptInputProps {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
  usageSummary?: SessionUsageSummary;
}

export function PromptInput({
  disabled = false,
  initialModel = null,
  isRunning = false,
  onSubmit,
  onSteer,
  onFollowUp,
  onStop,
  sessionId,
  usageSummary,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector(initialModel);

  const permissionSelectorProps = usePermissionSelector(sessionId);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const { editor, hasContent, text } = useChatEditor({
    // Note: we intentionally do NOT include `isRunning` in `disabled` so the user
    // can type steer/follow-up prompts while the agent is processing.
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
        "mx-auto flex w-full max-w-4xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
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
            usageSummary={usageSummary}
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

interface ContextUsageControlProps {
  draftText: string;
  model: AvailableModel | null;
  sessionId: string | null;
  usageSummary?: SessionUsageSummary;
}

function ContextUsageControl({
  draftText,
  model,
  sessionId,
  usageSummary,
}: ContextUsageControlProps) {
  const { invoke } = useElectronIPC();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ContextUsageSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!sessionId || !model) return null;

  const draftTokens = estimateDraftTokens(draftText);
  const measuredTokens = usageSummary?.latestRequestUsage?.totalTokens ?? snapshot?.usedTokens ?? 0;
  const contextWindow = model.contextWindow || snapshot?.contextWindow || 128_000;
  const usedTokens = Math.min(contextWindow, measuredTokens + draftTokens);
  const usageRatio = contextWindow > 0 ? usedTokens / contextWindow : 0;
  const usagePercentage = Math.min(100, Math.round(usageRatio * 100));
  const ringColor =
    usageRatio >= 0.85
      ? "var(--destructive)"
      : usageRatio >= 0.65
        ? "var(--chart-2)"
        : "var(--chart-3)";

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;

    setIsLoading(true);
    void invoke("getContextUsage", sessionId)
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch((error) => {
        console.error("Failed to load context usage", error);
      })
      .finally(() => setIsLoading(false));
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={`上下文窗口已使用 ${usagePercentage}%`}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <span
          className="flex size-[18px] items-center justify-center rounded-full"
          style={
            {
              background: `conic-gradient(${ringColor} ${usagePercentage}%, var(--muted) 0)`,
            } as CSSProperties
          }
        >
          <span className="size-3 rounded-full bg-card" />
        </span>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={10}
        className="w-80 rounded-2xl border border-border/80 bg-popover/96 p-4 shadow-[0_18px_48px_rgb(15_23_42/0.16)] backdrop-blur-xl"
      >
        <PopoverHeader>
          <PopoverDescription>上下文窗口</PopoverDescription>
          <div className="flex items-baseline gap-1.5">
            <PopoverTitle className="text-lg tabular-nums">
              {formatTokenCount(usedTokens)}
            </PopoverTitle>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              / {formatTokenCount(contextWindow)} tokens
            </span>
          </div>
        </PopoverHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              剩余约 {formatTokenCount(Math.max(0, contextWindow - usedTokens))} tokens
            </span>
            <span className="font-medium tabular-nums text-foreground">{usagePercentage}%</span>
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

        <Separator />

        {isLoading && !snapshot ? (
          <div className="flex items-center justify-center py-5 text-muted-foreground">
            <Spinner />
          </div>
        ) : snapshot ? (
          <ContextBreakdownList
            breakdown={snapshot.breakdown}
            draftTokens={draftTokens}
            totalTokens={Math.max(usedTokens, 1)}
          />
        ) : (
          <p className="m-0 py-3 text-center text-[11px] text-muted-foreground">
            暂时无法读取上下文构成
          </p>
        )}

        <Separator />

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            Session 总消耗 {formatTokenCount(usageSummary?.sessionUsage.totalTokens ?? 0)}
          </span>
          <span>{snapshot?.estimated ? "构成为估算值" : "随会话自动更新"}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContextBreakdownList({
  breakdown,
  draftTokens,
  totalTokens,
}: {
  breakdown: ContextUsageBreakdown;
  draftTokens: number;
  totalTokens: number;
}) {
  const items = [
    { icon: MessageSquareText, label: "对话消息", value: breakdown.conversation },
    { icon: Wrench, label: "工具结果", value: breakdown.toolResults },
    { icon: Sparkles, label: "系统指令", value: breakdown.systemPrompt },
    { icon: Settings2, label: "工具定义", value: breakdown.toolDefinitions },
    { icon: ChevronRight, label: "当前输入", value: draftTokens },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        const Icon = item.icon;
        const percentage = Math.min(100, (item.value / totalTokens) * 100);

        return (
          <div key={item.label} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {formatTokenCount(item.value)} · {formatPercentage(percentage / 100)}
              </span>
            </div>
            <Progress value={percentage} />
          </div>
        );
      })}
    </div>
  );
}

function getContextStatusMessage(usageRatio: number): string {
  if (usageRatio >= 0.95) return "上下文即将用尽，建议开启新会话。";
  if (usageRatio >= 0.85) return "上下文使用较高，长任务可能需要压缩历史。";
  if (usageRatio >= 0.65) return "上下文接近提醒阈值，当前仍可继续。";
  return "上下文空间充足，可继续当前任务。";
}
