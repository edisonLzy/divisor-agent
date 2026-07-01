import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type VoiceInputStatus = "idle" | "starting" | "recording";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
}

export function useVoiceInput() {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const activeRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const finalTranscriptRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionRetryDelayRef = useRef(120);
  const stopResolverRef = useRef<(() => void) | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef("");

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

  function settleStop() {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    stopResolverRef.current?.();
    stopResolverRef.current = null;
  }

  function resetTranscript() {
    finalTranscriptRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
  }

  async function start() {
    if (status !== "idle" || activeRef.current) return false;

    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("当前环境不支持语音转写");
      return false;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("当前环境无法访问麦克风");
      return false;
    }

    activeRef.current = true;
    setStatus("starting");
    setElapsedSeconds(0);
    resetTranscript();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const nextAnalyser = audioContext.createAnalyser();
      nextAnalyser.fftSize = 256;
      nextAnalyser.smoothingTimeConstant = 0.82;
      audioContext.createMediaStreamSource(stream).connect(nextAnalyser);
      audioContextRef.current = audioContext;
      setAnalyser(nextAnalyser);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "zh-CN";

      recognition.onresult = (event) => {
        recognitionRetryDelayRef.current = 120;
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const nextText = result?.[0]?.transcript.trim() ?? "";
          if (!nextText) continue;

          if (result.isFinal) {
            finalTranscriptRef.current = joinTranscript(finalTranscriptRef.current, nextText);
          } else {
            interimTranscript = joinTranscript(interimTranscript, nextText);
          }
        }

        const nextTranscript = joinTranscript(finalTranscriptRef.current, interimTranscript);
        transcriptRef.current = nextTranscript;
        setTranscript(nextTranscript);
      };

      recognition.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") return;

        if (event.error === "network") {
          recognitionRetryDelayRef.current = Math.min(
            Math.max(recognitionRetryDelayRef.current * 2, 1_500),
            30_000,
          );
          return;
        }

        activeRef.current = false;
        clearTimer();
        releaseAudio();
        setStatus("idle");
        settleStop();

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          toast.error("请允许麦克风权限后再试");
          return;
        }

        if (event.error === "audio-capture") {
          toast.error("没有检测到可用的麦克风");
          return;
        }

        toast.error("语音转写暂时不可用，请稍后再试");
      };

      recognition.onend = () => {
        if (stopResolverRef.current) {
          settleStop();
          return;
        }

        if (!activeRef.current) return;

        window.setTimeout(() => {
          if (!activeRef.current || recognitionRef.current !== recognition) return;

          try {
            recognition.start();
          } catch {
            activeRef.current = false;
            clearTimer();
            releaseAudio();
            setStatus("idle");
            toast.error("语音转写已中断，请重新开始");
          }
        }, recognitionRetryDelayRef.current);
      };

      recognitionRef.current = recognition;
      recognitionRetryDelayRef.current = 120;
      activeRef.current = true;
      recognition.start();

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
      recognitionRef.current = null;
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

  async function stop() {
    activeRef.current = false;
    clearTimer();
    releaseAudio();
    setStatus("idle");

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return transcriptRef.current.trim();

    await new Promise<void>((resolve) => {
      let didSettle = false;
      const finish = () => {
        if (didSettle) return;
        didSettle = true;
        resolve();
      };

      stopResolverRef.current = finish;
      stopTimeoutRef.current = window.setTimeout(() => {
        settleStop();
      }, 500);

      try {
        recognition.stop();
      } catch {
        settleStop();
      }
    });

    return transcriptRef.current.trim();
  }

  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearTimer();
      releaseAudio();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      settleStop();
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

function joinTranscript(left: string, right: string) {
  return [left.trim(), right.trim()].filter(Boolean).join(" ");
}
