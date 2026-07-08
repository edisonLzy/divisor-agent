import { session } from "electron";

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

/**
 * Inject Deepgram authentication into renderer WebSocket connections.
 *
 * Deepgram's `/v1/listen` streaming endpoint rejects raw API keys passed as the
 * `?token=` query parameter (returns `INVALID_AUTH`); it only accepts the key
 * via the `Authorization: Token <key>` request header. The browser/renderer
 * `WebSocket` API cannot set request headers, so the renderer opens the
 * WebSocket WITHOUT a token and we inject the `Authorization` header here, at
 * the network layer, for any WebSocket upgrade to `api.deepgram.com`.
 *
 * The API key is read from `VITE_DEEPGRAM_API_KEY` (exposed to the main process
 * via electron-vite's `envPrefix`). It never appears in the WebSocket URL.
 *
 * No-op when the key is not configured; the renderer's voice-input hook gates
 * startup on the same env var, so the user is guided to configure it first.
 */
export function registerDeepgramAuth(): void {
  if (!DEEPGRAM_API_KEY) return;

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["wss://api.deepgram.com/*"], types: ["webSocket"] },
    (details, callback) => {
      callback({
        requestHeaders: { ...details.requestHeaders, Authorization: `Token ${DEEPGRAM_API_KEY}` },
      });
    },
  );
}
