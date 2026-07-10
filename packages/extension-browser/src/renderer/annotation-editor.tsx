import { Button } from "@renderer/components/ui/button";
import { Textarea } from "@renderer/components/ui/textarea";
import { Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAnchoredFloating } from "./annotation-floating";

// ---------------------------------------------------------------------------
// Annotation comment editor (React overlay)
//
// The editor is a React overlay (not injected into the guest) so it gets
// types, lucide icons, and @floating-ui positioning. The guest-side bridge
// only emits an `open` event with marker geometry; this component owns the UI
// and is anchored at the marker's renderer-screen coordinates via floating-ui
// (flip + shift handle collision).
// ---------------------------------------------------------------------------

export interface AnnotationEditorProps {
  anchor: { x: number; y: number };
  initialComment: string;
  onCancel(): void;
  onDelete(): void;
  onSave(comment: string): void;
}

export default function AnnotationEditor({
  anchor,
  initialComment,
  onSave,
  onDelete,
  onCancel,
}: AnnotationEditorProps) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { refs, floatingStyles } = useAnchoredFloating(anchor, {
    offset: 10,
    placement: "bottom",
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    setComment(initialComment);
  }, [initialComment]);

  return createPortal(
    <div
      ref={refs.setFloating}
      className="z-50 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-md border-2 border-border bg-popover p-3 text-sm text-popover-foreground shadow-[var(--hard-shadow)]"
      style={floatingStyles}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">编辑批注</span>
        <Button
          aria-label="取消编辑批注"
          onClick={onCancel}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
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
      <div className="flex items-center justify-end gap-2">
        <Button
          aria-label="删除批注"
          className="text-destructive"
          onClick={onDelete}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!comment.trim()}
          onClick={() => onSave(comment.trim())}
          type="button"
        >
          <Save />
          保存
        </Button>
      </div>
    </div>,
    document.body,
  );
}
