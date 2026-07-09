import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BrowserAnnotationIntent,
  BrowserElementSelection,
  BrowserGrabPayload,
  BrowserGrabScreenshot,
} from "../common/types";

// ---------------------------------------------------------------------------
// Grab mode state machine
// ---------------------------------------------------------------------------

export type GrabModeState = "idle" | "awaiting" | "confirming" | "error";

export type GrabModeHook = {
  state: GrabModeState;
  payload: BrowserGrabPayload | null;
  screenshot: BrowserGrabScreenshot | null;
  screenShotDataUrl: string | null;
  error: string | null;
  intent: BrowserAnnotationIntent;
  /** True when the user right-clicked to select. */
  contextMenu: boolean;
  toggle: () => void;
  cancel: () => void;
  rearm: () => void;
  exit: () => void;
  setIntent: (intent: BrowserAnnotationIntent) => void;
  setError: (error: string | null) => void;
};

/**
 * Hook that drives the browser grab lifecycle for a single browser page.
 *
 * The state machine: idle → awaiting → confirming → idle
 *                                                    ↘ error → idle
 */
export function useGrabMode(
  startSelection: () => Promise<BrowserElementSelection>,
  cancelSelection: () => Promise<void>,
): GrabModeHook {
  const [state, setState] = useState<GrabModeState>("idle");
  const [payload, setPayload] = useState<BrowserGrabPayload | null>(null);
  const [screenShotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<BrowserAnnotationIntent>("change");
  const [contextMenu, setContextMenu] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const armAndAwait = useCallback(async () => {
    setError(null);
    setPayload(null);
    setScreenshotDataUrl(null);
    setContextMenu(false);
    setState("awaiting");
    try {
      const result = await startSelection();
      if (!mountedRef.current) return;
      setContextMenu(result.kind === "context-selected");
      setPayload(result.payload);
      setScreenshotDataUrl(result.screenshotDataUrl);
      setIntent("change");
      setState("confirming");
    } catch (cause) {
      if (!mountedRef.current) return;
      if (!/cancel/i.test(String(cause))) {
        setError(String(cause));
        setState("error");
      } else {
        setState("idle");
      }
    }
  }, [startSelection]);

  const toggle = useCallback(() => {
    if (state === "idle" || state === "error") {
      void armAndAwait();
    } else {
      void cancelSelection().catch(() => {});
      setState("idle");
      setPayload(null);
      setScreenshotDataUrl(null);
      setError(null);
      setContextMenu(false);
    }
  }, [state, armAndAwait, cancelSelection]);

  const cancel = useCallback(() => {
    void cancelSelection().catch(() => {});
    setState("idle");
    setPayload(null);
    setScreenshotDataUrl(null);
    setError(null);
    setContextMenu(false);
  }, [cancelSelection]);

  const rearm = useCallback(() => {
    setState("armed");
    setPayload(null);
    setScreenshotDataUrl(null);
    setError(null);
    setContextMenu(false);
    void armAndAwait();
  }, [armAndAwait]);

  const exit = useCallback(() => {
    void cancelSelection().catch(() => {});
    setState("idle");
    setPayload(null);
    setScreenshotDataUrl(null);
    setError(null);
    setContextMenu(false);
  }, [cancelSelection]);

  // Keyboard shortcut: Escape cancels grab mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "idle") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT")
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [state, cancel]);

  const screenshot: BrowserGrabScreenshot | null =
    payload && screenShotDataUrl
      ? {
          mimeType: "image/png" as const,
          dataUrl: screenShotDataUrl,
          width: Math.round(payload.target.rectViewport.width),
          height: Math.round(payload.target.rectViewport.height),
        }
      : null;

  return {
    state,
    payload,
    screenshot,
    screenShotDataUrl,
    error,
    intent,
    contextMenu,
    toggle,
    cancel,
    rearm,
    exit,
    setIntent,
    setError,
  };
}
