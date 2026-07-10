import { useAnchoredFloating } from "./annotation-floating";

// ---------------------------------------------------------------------------
// Annotation marker tooltip (React overlay)
//
// Hover tooltip for a marker pin. The pin lives in the guest; on hover it emits
// a `hover` event with its screen anchor, and this React tooltip is positioned
// against that anchor via @floating-ui. Replaces the old injected tooltip whose
// hand-rolled placeFloating landed in odd spots.
// ---------------------------------------------------------------------------

export interface AnnotationTooltipProps {
  anchor: { x: number; y: number };
  comment: string;
}

export default function AnnotationTooltip({ anchor, comment }: AnnotationTooltipProps) {
  const { refs, floatingStyles } = useAnchoredFloating(anchor, {
    offset: 6,
    placement: "top",
  });
  return (
    <div
      ref={refs.setFloating}
      className="z-50 max-w-[220px] rounded-md border-2 border-border bg-popover px-2 py-1 text-xs font-bold text-popover-foreground shadow-[var(--hard-shadow-sm)]"
      style={floatingStyles}
    >
      {comment || "Selected element"}
    </div>
  );
}
