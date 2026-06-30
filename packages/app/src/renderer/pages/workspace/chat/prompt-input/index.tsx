import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import {
  getSelectedCommandIds,
  slashCommandSuggestionPluginKey,
} from "@renderer/components/richtext/extensions/slash-commands";
import { Button } from "@renderer/components/ui/button";
import { Spinner } from "@renderer/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { EditorContent } from "@tiptap/react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { INSERT_PROMPT_TEXT_EVENT } from "../prompt-insert-event";
import type { PromptSubmission } from "../prompt-types";
import { useChatEditor } from "../use-chat-editor";
import { ModalSelector, useModalSelector } from "./modal-selector";
import { PermissionSelector, usePermissionSelector } from "./permission-selector";
import { useVoiceInput } from "./use-voice-input";

interface PromptInputProps {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
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
}: PromptInputProps) {
  const modelSelectorProps = useModalSelector(initialModel);

  const permissionSelectorProps = usePermissionSelector(sessionId);
  const voiceInput = useVoiceInput();

  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const { editor, hasContent } = useChatEditor({
    // Note: we intentionally do NOT include `isRunning` in `disabled` so the user
    // can type steer/follow-up prompts while the agent is processing.
    disabled,
    getFloatingReference: () => editorContainerRef.current,
  });

  useEffect(() => {
    editor?.setEditable(!disabled && !voiceInput.isRecording);
  }, [disabled, editor, voiceInput.isRecording]);

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
      if (disabled || !hasModel || !editor) {
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
    [disabled, editor, hasModel, modelSelectorProps.value, onFollowUp, onSteer, onSubmit],
  );

  // Listen for Enter / Mod+Enter on the editor container with `capture: true`
  // so the handler runs BEFORE TipTap's own Enter handler. This guarantees
  // `event.preventDefault()` blocks the newline insertion.
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        voiceInput.isRecording ||
        voiceInput.isStarting ||
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
  }, [editor, handleSubmit, isRunning, onFollowUp, voiceInput.isRecording, voiceInput.isStarting]);

  function appendVoiceTranscript(transcript: string) {
    const nextText = transcript.trim();
    if (!editor || !nextText) return;

    const currentText = editor.getText({ blockSeparator: "\n" }).trim();
    editor
      .chain()
      .insertContentAt(editor.state.doc.content.size, `${currentText ? " " : ""}${nextText}`)
      .focus("end")
      .run();
  }

  async function handleStopVoiceInput() {
    const transcript = await voiceInput.stop();
    appendVoiceTranscript(transcript);
    voiceInput.resetTranscript();

    if (!transcript) {
      toast.info("未识别到新的语音内容");
    }
  }

  async function handleSendVoiceInput() {
    const transcript = await voiceInput.stop();
    appendVoiceTranscript(transcript);
    voiceInput.resetTranscript();

    if (!transcript) {
      toast.info("未识别到新的语音内容，已保留原有文字");
      return;
    }

    if (!editor?.getText({ blockSeparator: "\n" }).trim()) {
      toast.info("没有识别到可发送的语音");
      return;
    }

    await handleSubmit();
  }

  const canSubmit = !disabled && !isRunning && hasContent && hasModel;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col rounded-[24px] border border-border bg-card shadow-[0_20px_48px_rgb(15_23_42/0.08)] transition-all duration-300 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 dark:shadow-[0_20px_48px_rgb(0_0_0/0.28)]",
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

          <div className="flex items-center justify-end gap-1.5">
            <ModalSelector {...modelSelectorProps} />

            <TooltipProvider delay={120}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      onClick={() => void voiceInput.start()}
                      disabled={disabled || isRunning || voiceInput.isStarting}
                      aria-label="Start voice input"
                    />
                  }
                >
                  {voiceInput.isStarting ? <Spinner /> : <Mic />}
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
      )}
    </div>
  );
}

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
                className="rounded-full"
                onClick={onStop}
                aria-label="Stop voice input and keep transcript"
              />
            }
          >
            <Square fill="currentColor" />
          </TooltipTrigger>
          <TooltipContent side="top">停止录音</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                className="rounded-full"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send voice prompt"
              />
            }
          >
            <ArrowUp />
          </TooltipTrigger>
          <TooltipContent side="top">发送</TooltipContent>
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
