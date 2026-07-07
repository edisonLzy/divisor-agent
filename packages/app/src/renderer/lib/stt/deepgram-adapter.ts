import type { SpeechToTextAdapter, STTConfig } from "@shared/stt-adapter";

const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";

interface DeepgramResult {
  type: string;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
    }>;
  };
  is_final?: boolean;
}

/**
 * Deepgram real-time STT adapter using raw WebSocket.
 *
 * Auth: API key passed as a query parameter (`?token=...`).
 * Audio: PCM16 linear16, mono, sent as binary WebSocket messages.
 * Results: JSON text messages with interim + final transcripts.
 */
export class DeepgramAdapter implements SpeechToTextAdapter {
  private ws: WebSocket | null = null;
  private config: STTConfig;
  private transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private finalTranscript = "";
  private _isConnected = false;

  constructor(config: STTConfig) {
    this.config = {
      model: "nova-3",
      language: "zh-CN",
      ...config,
    };
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async start(): Promise<void> {
    if (this._isConnected) return;

    const url = new URL(DEEPGRAM_WS_URL);
    url.searchParams.set("token", this.config.apiKey);
    url.searchParams.set("model", this.config.model ?? "nova-3");
    url.searchParams.set("language", this.config.language ?? "zh-CN");
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", "16000");
    url.searchParams.set("channels", "1");

    this.finalTranscript = "";

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url.toString());
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      const onOpen = () => {
        this._isConnected = true;
        resolve();
      };

      const onMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(
            typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data),
          ) as DeepgramResult;

          if (data.type !== "Results") return;

          const transcript = data.channel?.alternatives?.[0]?.transcript ?? "";
          if (!transcript) return;

          if (data.is_final) {
            this.finalTranscript = joinTranscript(this.finalTranscript, transcript);
            this.transcriptCallback?.(transcript, true);
          } else {
            this.transcriptCallback?.(transcript, false);
          }
        } catch {
          // Ignore parse errors for non-JSON messages
        }
      };

      const onError = () => {
        this._isConnected = false;
        this.errorCallback?.(new Error("Deepgram WebSocket connection failed"));
        reject(new Error("Deepgram WebSocket connection failed"));
      };

      const onClose = () => {
        this._isConnected = false;
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("message", onMessage);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
      };

      ws.addEventListener("open", onOpen);
      ws.addEventListener("message", onMessage);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    });
  }

  sendAudio(chunk: ArrayBuffer | ArrayBufferView): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk as ArrayBuffer);
  }

  async stop(): Promise<string> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send CloseStream to signal end-of-audio
      this.ws.send(JSON.stringify({ type: "CloseStream" }));

      // Wait briefly for final results
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 800);
        const onClose = () => {
          clearTimeout(timeout);
          resolve();
        };
        this.ws?.addEventListener("close", onClose, { once: true });
      });
    }

    this.ws?.close();
    this.ws = null;
    this._isConnected = false;

    return this.finalTranscript.trim();
  }

  onTranscript(callback: (text: string, isFinal: boolean) => void): void {
    this.transcriptCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  configure(config: Partial<STTConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

function joinTranscript(left: string, right: string): string {
  return [left.trim(), right.trim()].filter(Boolean).join(" ");
}
