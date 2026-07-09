import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { Save, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  BrowserAnnotationIntent,
  BrowserAnnotationViewportBridgeOpenPayload,
} from "../common/types";
import { ANNOTATION_EDITOR_WIDTH, computeEditorPosition } from "./annotation-editor-position";

// ---------------------------------------------------------------------------
// Annotation comment editor (React overlay)
//
// Why this exists in React instead of injected into the guest page: the
// migration from WebContentsView to <webview> lets React overlays paint above
// the browser. So the editor gets types, lucide icons, and real tests - none
// of which the old injected-string editor had. The guest-side bridge only
// emits an `open` event with marker geometry; this component owns the UI.
//
// Positioning: we receive the marker's renderer-screen anchor (webview origin
// + guest viewport rect) and place the editor below it, flipping above and
// clamping into the viewport. Done in React rather than via a Popover
// Positioner so we control collision against the browser pane directly.
// ---------------------------------------------------------------------------

const EDITOR_FALLBACK_HEIGHT = 224;

const INTENT_OPTIONS: { value: BrowserAnnotationIntent; label: string; className: string }[] = [
  { value: "fix", label: "Fix", className: "bg-signal-yellow text-accent-foreground" },
  { value: "change", label: "Change", className: "bg-signal-cyan text-accent-foreground" },
  { value: "question", label: "Question", className: "bg-signal-purple text-accent-foreground" },
  { value: "approve", label: "Approve", className: "bg-signal-green text-accent-foreground" },
];

export interface AnnotationEditorAnchor {
  x: number;
  y: number;
}

export interface AnnotationEditorProps {
  anchor: AnnotationEditorAnchor;
  initialComment: string;
  initialIntent: BrowserAnnotationIntent;
  payload: BrowserAnnotationViewportBridgeOpenPayload;
  onSave(comment: string, intent: BrowserAnnotationIntent): void;
  onDelete(): void;
  onCancel(): void;
}

export default function AnnotationEditor({
  anchor,
  initialComment,
  initialIntent,
  payload,
  onSave,
  onDelete,
  onCancel,
}: AnnotationEditorProps) {
  const [comment, setComment] = useState(initialComment);
  const [intent, setIntent] = useState<BrowserAnnotationIntent>(initialIntent);
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Position after mount so we can measure the card height for the flip check.
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? EDITOR_FALLBACK_HEIGHT;
    setPosition(
      computeEditorPosition({
        anchorX: anchor.x,
        anchorY: anchor.y,
        cardHeight: height,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      }),
    );
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div
      ref={cardRef}
      className="fixed z-50 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-md border-2 border-border bg-popover p-3 text-sm text-popover-foreground shadow-[var(--hard-shadow)]"
      style={{ left: position.left, top: position.top, width: ANNOTATION_EDITOR_WIDTH }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <code className="rounded-sm border-2 border-border bg-card px-1 py-0.5 font-mono text-[10px] font-bold">
            {`<${payload.tagName}>`}
          </code>
          <span>{payload.intent}</span>
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onCancel}>
          <X />
        </Button>
      </div>
      <Textarea
        ref={textareaRef}
        className="min-h-16 resize-none text-xs"
        onChange={(event) => setComment(event.target.value)}
        placeholder="添加评论..."
        value={comment}
      />
      <div className="flex gap-1.5">
        {INTENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`rounded-sm border-2 border-border px-2 py-1 text-[11px] font-bold transition-colors ${
              intent === option.value
                ? option.className
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setIntent(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 />
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => onSave(comment.trim() || "Selected element", intent)}
        >
          <Save className="size-3.5" />
          保存
        </Button>
      </div>
    </div>
  );
}
