import { createSTTAdapter } from "@renderer/lib/stt";
import type { SpeechToTextAdapter } from "@shared/stt-adapter";
import type { STTProvider } from "@shared/stt-adapter";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type VoiceInputStatus = "idle" | "starting" | "recording";

export interface VoiceInputConfig {
  provider?: STTProvider;
  apiKey?: string;
  model?: string;
  language?: string;
}

export function useVoiceInput(config: VoiceInputConfig = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const activeRef = useRef(false);
  const adapterRef = useRef<SpeechToTextAdapter | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef("");
  const finalTranscriptRef = useRef("");

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function releaseAudio() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }

    setAnalyser(null);
  }

  function resetTranscript() {
    finalTranscriptRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
  }

  async function start(): Promise<boolean> {
    if (status !== "idle" || activeRef.current) return false;

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("当前环境无法访问麦克风");
      return false;
    }

    const apiKey = config.apiKey ?? "";
    if (!apiKey) {
      toast.error("请先配置语音识别 API Key");
      return false;
    }

    activeRef.current = true;
    setStatus("starting");
    setElapsedSeconds(0);
    resetTranscript();

    try {
      // 1. Open microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: { ideal: 16000 },
        },
      });
      streamRef.current = stream;

      // 2. Create audio context + analyser for waveform
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const nextAnalyser = audioContext.createAnalyser();
      nextAnalyser.fftSize = 256;
      nextAnalyser.smoothingTimeConstant = 0.82;
      source.connect(nextAnalyser);
      audioContextRef.current = audioContext;
      setAnalyser(nextAnalyser);

      // 3. Create script processor for PCM extraction
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(audioContext.destination);

      // 4. Create STT adapter
      const adapter = createSTTAdapter(config.provider ?? "deepgram", {
        apiKey,
        model: config.model ?? "nova-3",
        language: config.language ?? navigator.language ?? "zh-CN",
      });
      adapterRef.current = adapter;

      adapter.onTranscript((text, isFinal) => {
        if (isFinal) {
          finalTranscriptRef.current = joinTranscript(finalTranscriptRef.current, text);
          transcriptRef.current = finalTranscriptRef.current;
          setTranscript(finalTranscriptRef.current);
        } else {
          // Show interim + accumulated final
          const display = joinTranscript(finalTranscriptRef.current, text);
          transcriptRef.current = display;
          setTranscript(display);
        }
      });

      adapter.onError((error) => {
        console.error("STT adapter error:", error);
        if (activeRef.current) {
          toast.error("语音转写出错，请重试");
        }
      });

      await adapter.start();

      // 5. Pipe audio chunks to adapter
      processor.onaudioprocess = (event) => {
        if (!activeRef.current) return;
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(inputBuffer);
        adapterRef.current?.sendAudio(pcm16);
      };

      // 6. Start timer
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);

      setStatus("recording");
      return true;
    } catch (error) {
      activeRef.current = false;
      clearTimer();
      releaseAudio();
      adapterRef.current = null;
      setStatus("idle");

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.error("请允许麦克风权限后再试");
      } else if (error instanceof DOMException && error.name === "NotFoundError") {
        toast.error("没有检测到可用的麦克风");
      } else {
        toast.error("无法启动语音输入");
      }

      return false;
    }
  }

  async function stop(): Promise<string> {
    activeRef.current = false;
    clearTimer();
    releaseAudio();

    const adapter = adapterRef.current;
    adapterRef.current = null;
    setStatus("idle");

    if (!adapter) return transcriptRef.current.trim();

    try {
      const finalText = await adapter.stop();
      if (finalText) {
        finalTranscriptRef.current = finalText;
        transcriptRef.current = finalText;
        setTranscript(finalText);
      }
    } catch {
      // Adapter already called onError
    }

    return transcriptRef.current.trim();
  }

  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearTimer();
      releaseAudio();
      adapterRef.current?.stop();
      adapterRef.current = null;
    };
  }, []);

  return {
    analyser,
    elapsedSeconds,
    isRecording: status === "recording",
    isStarting: status === "starting",
    resetTranscript,
    start,
    stop,
    transcript,
  };
}

function joinTranscript(left: string, right: string): string {
  return [left.trim(), right.trim()].filter(Boolean).join(" ");
}

/**
 * Convert Float32Array audio samples to Int16 PCM.
 */
function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm16;
}
