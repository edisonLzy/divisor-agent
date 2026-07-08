import type { SpeechToTextAdapter, STTConfig, STTProvider } from "@shared/stt-adapter";

import { DeepgramAdapter } from "./deepgram-adapter";

/**
 * Create an STT adapter for the given provider.
 * Throws if the provider is not supported.
 */
export function createSTTAdapter(provider: STTProvider, config: STTConfig): SpeechToTextAdapter {
  switch (provider) {
    case "deepgram":
      return new DeepgramAdapter(config);
    default:
      throw new Error(`Unsupported STT provider: ${provider}`);
  }
}
