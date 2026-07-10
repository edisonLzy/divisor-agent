import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { useAnchoredFloating, type ScreenPoint } from "./annotation-floating";

interface AnnotationComposerProps {
  anchor: ScreenPoint;
  onCancel(): void;
  onSave(comment: string): void;
}

/** Compact in-context composer displayed after an element is selected. */
export default function AnnotationComposer({ anchor, onCancel, onSave }: AnnotationComposerProps) {
  const [comment, setComment] = useState("");
  const { refs, floatingStyles } = useAnchoredFloating(anchor, {
    offset: 10,
    placement: "bottom",
  });
  const trimmedComment = comment.trim();

  const save = () => {
    if (!trimmedComment) return;
    onSave(trimmedComment);
  };

  return createPortal(
    <div
      ref={refs.setFloating}
      className="z-50 flex w-[22.5rem] max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-md border-2 border-border bg-popover p-1.5 text-popover-foreground shadow-[var(--hard-shadow)]"
      style={floatingStyles}
    >
      <Input
        autoFocus
        className="h-8 min-w-0 flex-1 text-xs"
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          save();
        }}
        placeholder="添加评论..."
        value={comment}
      />
      <Button
        aria-label="取消添加批注"
        onClick={onCancel}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
      <Button
        aria-label="保存批注"
        disabled={!trimmedComment}
        onClick={save}
        size="icon-xs"
        type="button"
      >
        <Check />
      </Button>
    </div>,
    document.body,
  );
}
