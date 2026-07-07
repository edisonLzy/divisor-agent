import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import type { EntryTokenUsage } from "@renderer/apis/sessions";
import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@renderer/components/ui/hover-card";
import { Progress } from "@renderer/components/ui/progress";
import { Spinner } from "@renderer/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { formatTokenCount } from "@renderer/lib/token-usage";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { EditorContent } from "@tiptap/react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { getCurrentContextTokens } from "../../use-agent-token-usage";
import { INSERT_PROMPT_TEXT_EVENT } from "../prompt-insert-event";
import type { PromptSubmission } from "../prompt-types";
import { useChatEditor, UseChatEditorOptions } from "../use-chat-editor";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";
import { useVoiceInput } from "./use-voice-input";

export interface PromptInputProps extends Pick<UseChatEditorOptions, "onCreate" | "onDestroy"> {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
  tokenUsage?: EntryTokenUsage;
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
  tokenUsage,
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector(initialModel);

  const permissionSelectorProps = usePermissionSelector(sessionId);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const voiceInput = useVoiceInput({
    apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY,
  });

  const { editor, hasContent } = useChatEditor({
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

  // Make editor non-editable while recording
  useEffect(() => {
    editor?.setEditable(!disabled && !voiceInput.isRecording);
  }, [disabled, editor, voiceInput.isRecording]);

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

  const handleStopVoiceInput = useCallback(async () => {
    const transcript = await voiceInput.stop();
    if (!editor) return;

    if (transcript) {
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, transcript).run();
    } else {
      toast.info("未识别到新的语音内容，已保留原有文字");
    }
  }, [editor, voiceInput]);

  const handleSendVoiceInput = useCallback(async () => {
    const transcript = await voiceInput.stop();
    if (!editor) return;

    if (transcript) {
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, transcript).run();
    }

    if (!editor.getText({ blockSeparator: "\n" }).trim()) {
      toast.info("没有识别到可发送的语音");
      return;
    }

    await handleSubmit();
  }, [editor, handleSubmit, voiceInput]);

  // Suppress Enter keydown during recording
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const suppressKeyDown = (event: KeyboardEvent) => {
      if (voiceInput.isRecording || voiceInput.isStarting) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    container.addEventListener("keydown", suppressKeyDown, { capture: true });
    return () => {
      container.removeEventListener("keydown", suppressKeyDown, { capture: true });
    };
  }, [voiceInput.isRecording, voiceInput.isStarting]);

  const canSubmit = !disabled && !isRunning && hasContent && hasModel;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col rounded-lg border-2 border-border bg-card shadow-[var(--hard-shadow)] transition-all duration-200 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
        disabled && !isRunning && "opacity-80",
      )}
    >
      <div ref={editorContainerRef} className="relative min-h-14 px-3.5 py-2.5">
        {voiceInput.isRecording ? (
          <VoiceTranscriptPreview
            existingText={editor?.getText({ blockSeparator: "\n" }) ?? ""}
            transcript={voiceInput.transcript}
          />
        ) : (
          <EditorContent editor={editor} className="prompt-editor max-w-none" />
        )}
      </div>

      {voiceInput.isRecording ? (
        <VoiceRecordingControls
          analyser={voiceInput.analyser}
          canSend={hasModel && (hasContent || voiceInput.transcript.trim().length > 0)}
          elapsedSeconds={voiceInput.elapsedSeconds}
          onSend={() => void handleSendVoiceInput()}
          onStop={() => void handleStopVoiceInput()}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <PermissionSelector {...permissionSelectorProps} />
          </div>

          <div className="flex items-center justify-end gap-2">
            {tokenUsage ? (
              <ContextUsageControl model={modelSelectorProps.value} tokenUsage={tokenUsage} />
            ) : null}

            <ModalSelector {...modelSelectorProps} />

            <TooltipProvider delay={120}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-md"
                      onClick={() => void voiceInput.start()}
                      disabled={disabled || isRunning || voiceInput.isStarting}
                      aria-label="Start voice input"
                    />
                  }
                >
                  {voiceInput.isStarting ? <Spinner /> : <Mic className="size-4" />}
                </TooltipTrigger>
                <TooltipContent side="top">语音输入</TooltipContent>
              </Tooltip>
            </TooltipProvider>

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
      )}
    </div>
  );
}

interface ContextUsageControlProps {
  model: AvailableModel | null;
  tokenUsage: EntryTokenUsage;
}

function ContextUsageControl({ model, tokenUsage }: ContextUsageControlProps) {
  if (!model) return null;

  const measuredTokens = getCurrentContextTokens(tokenUsage);
  const contextWindow = model.contextWindow || 128_000;
  const usedTokens = Math.min(contextWindow, measuredTokens);
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
    <HoverCard>
      <HoverCardTrigger
        aria-label={`上下文窗口已使用 ${usagePercentage}%`}
        className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <span
          className="flex size-[14px] items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ringColor} ${usagePercentage}%, var(--muted) 0)`,
          }}
        >
          <span className="size-2 rounded-full bg-card" />
        </span>
      </HoverCardTrigger>

      <HoverCardContent
        align="end"
        side="top"
        sideOffset={8}
        className="flex w-64 flex-col gap-2.5 p-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] text-muted-foreground">上下文窗口</span>
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {formatTokenCount(usedTokens)}
            <span className="text-[10px] font-normal text-muted-foreground">
              {" "}
              / {formatTokenCount(contextWindow)} · {usagePercentage}%
            </span>
          </span>
        </div>

        <Progress value={usagePercentage} />

        <div className="flex items-center justify-between gap-3 text-[10px]">
          <span
            className={cn(
              "truncate text-muted-foreground",
              usageRatio >= 0.85 && "text-destructive",
            )}
          >
            {getContextStatusMessage(usageRatio)}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
            剩余 {formatTokenCount(Math.max(0, contextWindow - usedTokens))}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function getContextStatusMessage(usageRatio: number): string {
  if (usageRatio >= 0.95) return "上下文即将用尽，建议开启新会话。";
  if (usageRatio >= 0.85) return "上下文使用较高，长任务可能需要压缩历史。";
  if (usageRatio >= 0.65) return "上下文接近提醒阈值，当前仍可继续。";
  return "上下文空间充足，可继续当前任务。";
}

// ── Voice input components ──────────────────────────────────────────────────

interface VoiceRecordingControlsProps {
  analyser: AnalyserNode | null;
  canSend: boolean;
  elapsedSeconds: number;
  onSend: () => void;
  onStop: () => void;
}

function VoiceRecordingControls({
  analyser,
  canSend,
  elapsedSeconds,
  onSend,
  onStop,
}: VoiceRecordingControlsProps) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-3">
      <VoiceWaveform analyser={analyser} />
      <span
        className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {formatDuration(elapsedSeconds)}
      </span>

      <TooltipProvider delay={120}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="rounded-md"
                onClick={onStop}
                aria-label="Stop voice input and keep transcript"
              />
            }
          >
            <Square className="size-3.5" fill="currentColor" />
          </TooltipTrigger>
          <TooltipContent side="top">停止录音并保留文字</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                className="rounded-md"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Stop voice input and send"
              />
            }
          >
            <ArrowUp className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="top">发送语音转写结果</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function VoiceTranscriptPreview({
  existingText,
  transcript,
}: {
  existingText: string;
  transcript: string;
}) {
  const preview = [existingText.trim(), transcript.trim()].filter(Boolean).join(" ");

  return (
    <div className="min-h-12 whitespace-pre-wrap text-[14px] leading-6 text-foreground">
      {preview || <span className="text-muted-foreground">正在聆听…</span>}
    </div>
  );
}

function VoiceWaveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const waveformCanvas = canvas;
    const waveformContext = context;
    const waveformAnalyser = analyser;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame = 0;

    function resizeCanvas() {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(waveformCanvas.clientWidth, 1);
      const height = Math.max(waveformCanvas.clientHeight, 1);
      waveformCanvas.width = Math.round(width * ratio);
      waveformCanvas.height = Math.round(height * ratio);
      waveformContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw() {
      const width = waveformCanvas.clientWidth;
      const height = waveformCanvas.clientHeight;
      waveformAnalyser.getByteTimeDomainData(samples);
      waveformContext.clearRect(0, 0, width, height);
      waveformContext.strokeStyle = getComputedStyle(waveformCanvas).color;
      waveformContext.globalAlpha = 0.78;
      waveformContext.lineWidth = 1.5;
      waveformContext.lineCap = "round";

      const barCount = Math.max(Math.floor(width / 6), 12);
      const step = Math.max(Math.floor(samples.length / barCount), 1);
      const gap = width / barCount;

      for (let index = 0; index < barCount; index += 1) {
        const amplitude = Math.abs(samples[index * step] - 128) / 128;
        const barHeight = Math.max(2, amplitude * height * 1.8);
        const x = gap * index + gap / 2;

        waveformContext.beginPath();
        waveformContext.moveTo(x, height / 2 - barHeight / 2);
        waveformContext.lineTo(x, height / 2 + barHeight / 2);
        waveformContext.stroke();
      }

      animationFrame = window.requestAnimationFrame(draw);
    }

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(waveformCanvas);
    draw();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      className="h-8 min-w-0 flex-1 text-foreground"
      role="img"
      aria-label="Live microphone waveform"
    />
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
