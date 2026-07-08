import { Button } from "@renderer/components/ui/button";
import { Spinner } from "@renderer/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

export interface VoiceInputButtonProps {
  analyser: AnalyserNode | null;
  elapsedSeconds: number;
  isRecording: boolean;
  isStarting: boolean;
  /** Gates starting a new recording (e.g. disabled or agent running). */
  disabled?: boolean;
  /** Begins a recording session. */
  start: () => void;
  /** Ends the current session and resolves with the transcript. */
  stop: () => Promise<string>;
  /** Called after a recording stops, exposing the recognized text. */
  onStop?: (transcript: string) => void;
}

export function VoiceInputButton({
  analyser,
  elapsedSeconds,
  isRecording,
  isStarting,
  disabled = false,
  start,
  stop,
  onStop,
}: VoiceInputButtonProps) {
  const handleClick = useCallback(() => {
    if (isStarting) return;

    if (isRecording) {
      void stop().then((transcript) => onStop?.(transcript));
    } else {
      start();
    }
  }, [isRecording, isStarting, start, stop, onStop]);

  if (isRecording) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-3">
        <Button
          type="button"
          variant="secondary"
          className="flex h-9 w-full items-center gap-2.5 rounded-md"
          onClick={handleClick}
          aria-label="停止录音并保留文字"
        >
          <VoiceWaveform analyser={analyser} />
          <span
            className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {formatDuration(elapsedSeconds)}
          </span>
          <Square className="size-3.5 shrink-0" fill="currentColor" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delay={120}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md"
              onClick={handleClick}
              disabled={disabled || isStarting}
              aria-label="语音输入"
            />
          }
        >
          {isStarting ? <Spinner /> : <Mic className="size-4" />}
        </TooltipTrigger>
        <TooltipContent side="top">语音输入</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
