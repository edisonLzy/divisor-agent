import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type Placement,
} from "@floating-ui/react";
import { useLayoutEffect, useState } from "react";

export interface ScreenPoint {
  x: number;
  y: number;
}

interface FloatingPosition {
  x: number;
  y: number;
}

/**
 * Positions a host-rendered overlay against a point inside an Electron
 * <webview>. The overlay itself is portalled to document.body, so all values
 * here are renderer viewport coordinates rather than artifact-local values.
 */
export function useAnchoredFloating(
  anchor: ScreenPoint | null,
  options: { offset?: number; placement?: Placement } = {},
) {
  const { offset: offsetPx = 8, placement = "bottom" } = options;
  const [floating, setFloating] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !floating) {
      setPosition(null);
      return;
    }

    const reference = virtualElementAt(anchor);
    let disposed = false;
    const updatePosition = () => {
      void computePosition(reference, floating, {
        middleware: [offset(offsetPx), flip(), shift({ padding: 8 })],
        placement,
        strategy: "fixed",
      }).then(({ x, y }) => {
        if (!disposed) setPosition({ x, y });
      });
    };

    const cleanup = autoUpdate(reference, floating, updatePosition);
    return () => {
      disposed = true;
      cleanup();
    };
  }, [anchor, floating, offsetPx, placement]);

  return {
    floatingStyles: {
      left: position?.x ?? 0,
      position: "fixed" as const,
      top: position?.y ?? 0,
      visibility: position ? ("visible" as const) : ("hidden" as const),
    },
    refs: { setFloating },
  };
}

function virtualElementAt(point: ScreenPoint) {
  return {
    contextElement: document.documentElement,
    getBoundingClientRect() {
      const { x, y } = point;
      return { bottom: y, height: 0, left: x, right: x, top: y, width: 0, x, y };
    },
  };
}
