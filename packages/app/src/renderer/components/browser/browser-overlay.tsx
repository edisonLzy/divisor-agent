import type { Observation } from "@shared/browser-artifact-ipc";
import { useEffect, useState } from "react";

import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";

interface BrowserOverlayProps {
  className?: string;
  /** CSS selector for the stage div (used to compute ref box coordinates). */
  stageSelector?: string;
}

interface RefBox {
  bottom: number;
  left: number;
  ref: string;
  right: number;
  top: number;
}

/**
 * Subscribes to `browser_screenshot_updated` and the active observation
 * (carried via window globals set by the BrowserArtifact renderer) to draw
 * translucent boxes for each `ref` so the user can see which element the
 * agent is about to interact with.
 */
export function BrowserOverlay({ className, stageSelector }: BrowserOverlayProps) {
  const { on } = useElectronIPC();
  const [boxes, setBoxes] = useState<RefBox[]>([]);
  const [pulseRef, setPulseRef] = useState<string | null>(null);

  useEffect(() => {
    const offScreenshot = on("browser_screenshot_updated", (event) => {
      // The screenshot itself is rendered by BrowserArtifact; we just listen
      // here so the active observation gets refreshed when a new frame
      // arrives. The actual ref boxes are derived from the latest
      // `Observation.refMap` (browser_artifact attaches it to window state).
      const win = window as unknown as { __browserLatestObservation?: Observation };
      if (!win.__browserLatestObservation) return;
      const stage = document.querySelector(
        stageSelector ?? "[data-browser-stage]",
      ) as HTMLElement | null;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      // Refs from `Observation.refMap` don't carry bounding boxes (we only
      // store backendNodeId); a richer implementation would call
      // DOM.getBoxModel on each ref. For Phase B we just show the refs list.
      const refEntries = Object.keys(win.__browserLatestObservation.refMap ?? {});
      setBoxes(
        refEntries.slice(0, 8).map((ref) => ({
          bottom: 0,
          left: 0,
          ref,
          right: 0,
          top: 0,
        })),
      );
      void stageRect;
    });
    return offScreenshot;
  }, [on, stageSelector]);

  if (boxes.length === 0) return null;
  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      {boxes.map((box) => (
        <div
          key={box.ref}
          style={{
            animation: pulseRef === box.ref ? "browser-pulse 1.2s ease-out infinite" : undefined,
            border: "1px dashed rgba(125, 211, 252, 0.7)",
            borderRadius: 6,
            color: "rgba(186, 230, 253, 0.95)",
            fontSize: 10,
            padding: "1px 4px",
            position: "absolute",
          }}
        >
          {box.ref}
        </div>
      ))}
    </div>
  );
}