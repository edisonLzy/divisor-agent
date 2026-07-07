/**
 * Speech-to-Text adapter interface.
 *
 * Each STT provider (Deepgram, Whisper, AssemblyAI, etc.) implements this
 * interface. The voice-input hook uses the adapter without knowing which
 * provider is behind it — swap the adapter to change providers.
 */

export interface STTConfig {
  /** Provider-specific model, e.g. "nova-3" or "whisper-large-v3" */
  model?: string;
  /** BCP-47 language tag, e.g. "zh-CN" or "en" */
  language?: string;
  /** API key for the provider */
  apiKey: string;
}

export interface SpeechToTextAdapter {
  /**
   * Open the connection and prepare for streaming.
   * Must be called before sendAudio().
   */
  start(): Promise<void>;

  /**
   * Send an audio chunk (PCM16 linear16, mono, sample rate matching config).
   */
  sendAudio(chunk: ArrayBuffer | ArrayBufferView): void;

  /**
   * Signal end-of-stream and return the final concatenated transcript.
   * After this, the adapter is no longer usable.
   */
  stop(): Promise<string>;

  /**
   * Register a callback for transcription results.
   * Called with `isFinal = false` for interim results and `isFinal = true`
   * for the final utterance.
   */
  onTranscript(callback: (text: string, isFinal: boolean) => void): void;

  /**
   * Register a callback for errors.
   */
  onError(callback: (error: Error) => void): void;

  /**
   * Update configuration without restarting the connection.
   */
  configure(config: Partial<STTConfig>): void;

  /**
   * Whether the adapter is currently connected.
   */
  readonly isConnected: boolean;
}

export type STTProvider = "deepgram" | "whisper" | "assemblyai" | "local";
