import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from "@floating-ui/react";
import { useLayoutEffect } from "react";

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Anchors a host-rendered overlay to a point reported from an Electron
 * webview. Floating UI keeps the portal within the Browser Artifact boundary
 * and supplies dismissal behavior for outside presses and Escape.
 */
export function useAnchoredFloating(
  anchor: ScreenPoint | null,
  options: {
    boundary?: HTMLElement | null;
    offset?: number;
    onDismiss?(): void;
    placement?: Placement;
  } = {},
) {
  const { boundary = null, offset: offsetPx = 8, onDismiss, placement = "bottom" } = options;
  const { context, floatingStyles, refs, update } = useFloating({
    middleware: [
      offset(offsetPx),
      flip({ boundary: boundary ?? undefined, padding: 8 }),
      shift({ boundary: boundary ?? undefined, padding: 8 }),
      size({
        apply({ availableHeight, availableWidth, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
          elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`;
        },
        boundary: boundary ?? undefined,
        padding: 8,
      }),
    ],
    onOpenChange(open) {
      if (!open) onDismiss?.();
    },
    open: Boolean(anchor),
    placement,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  useLayoutEffect(() => {
    refs.setReference(anchor ? virtualElementAt(anchor, boundary) : null);
    void update();
  }, [anchor, boundary, refs, update]);

  return {
    floatingStyles: {
      ...floatingStyles,
      visibility:
        anchor && floatingStyles.left !== undefined ? ("visible" as const) : ("hidden" as const),
    },
    getFloatingProps,
    refs: { setFloating: refs.setFloating },
  };
}

function virtualElementAt(point: ScreenPoint, boundary: HTMLElement | null) {
  return {
    contextElement: boundary ?? document.documentElement,
    getBoundingClientRect() {
      const { x, y } = point;
      return { bottom: y, height: 0, left: x, right: x, top: y, width: 0, x, y };
    },
  };
}
