// Pure positioning helper for the annotation editor card. Extracted into its
// own module (no React / UI imports) so it can be unit-tested in isolation.

const DEFAULT_EDITOR_WIDTH = 352;
const MARGIN = 8;
const GAP = 8;

/**
 * Center the editor on the marker, clamp into the viewport, and flip above
 * when below would overflow.
 */
export function computeEditorPosition(args: {
  anchorX: number;
  anchorY: number;
  viewportWidth: number;
  viewportHeight: number;
  cardHeight: number;
  cardWidth?: number;
}): { left: number; top: number } {
  const width = args.cardWidth ?? DEFAULT_EDITOR_WIDTH;
  let left = args.anchorX + 12 - width / 2;
  if (left + width > args.viewportWidth - MARGIN) left = args.viewportWidth - width - MARGIN;
  if (left < MARGIN) left = MARGIN;
  let top = args.anchorY + GAP;
  if (top + args.cardHeight > args.viewportHeight - MARGIN)
    top = args.anchorY - args.cardHeight - GAP;
  if (top < MARGIN) top = MARGIN;
  return { left, top };
}

export const ANNOTATION_EDITOR_WIDTH = DEFAULT_EDITOR_WIDTH;
