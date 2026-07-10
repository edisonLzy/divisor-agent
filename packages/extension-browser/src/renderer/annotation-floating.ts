import { autoUpdate, offset, shift, flip, useFloating } from "@floating-ui/react";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Floating anchor helpers for annotation overlays (tooltip + editor)
//
// Marker pins live inside the guest <webview> (they must, to follow the target
// element through scroll). The tooltip and editor, however, are React overlays
// in the host renderer - they paint above the <webview> and use @floating-ui
// to position against a *virtual* anchor derived from the marker's
// renderer-screen coordinates. This replaces the hand-rolled placeFloating /
// computeEditorPosition collision math with floating-ui's flip + shift.
// ---------------------------------------------------------------------------

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Build a zero-size virtual element at a screen point for floating-ui. */
function virtualElementAt(point: ScreenPoint) {
  return {
    getBoundingClientRect() {
      const x = point.x;
      const y = point.y;
      return { x, y, width: 0, height: 0, top: y, left: x, right: x, bottom: y };
    },
  };
}

/**
 * Position a floating overlay (fixed strategy) anchored at a screen point,
 * with flip + shift collision handling and live autoUpdate.
 */
export function useAnchoredFloating(
  anchor: ScreenPoint | null,
  options: { offset?: number; placement?: "top" | "bottom" } = {},
) {
  const { offset: offsetPx = 8, placement = "bottom" } = options;
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, update } = useFloating({
    middleware: [offset(offsetPx), flip(), shift({ padding: 8 })],
    open,
    onOpenChange: setOpen,
    placement,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (anchor) {
      refs.setPositionReference(virtualElementAt(anchor));
      void update();
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [anchor, refs, update]);

  return { refs, floatingStyles, open };
}
