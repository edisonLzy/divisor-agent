import { Button } from "@renderer/components/ui/button";
import { BookOpenText, Lightbulb, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";

import type { BrowserReadingTag, BrowserTextSelection } from "../common/types";
import { useAnchoredFloating, type ScreenPoint } from "./annotation-floating";

interface ReadingAnnotationToolbarProps {
  anchor: ScreenPoint;
  boundary: HTMLElement | null;
  onAsk(instruction: string): void;
  onCancel(): void;
  onHighlight(tag: BrowserReadingTag): void;
  selection: BrowserTextSelection;
  tags: readonly BrowserReadingTag[];
}

/** Page-local selection toolbar: it only exists while a reader has text selected. */
export function ReadingAnnotationToolbar({
  anchor,
  boundary,
  onAsk,
  onCancel,
  onHighlight,
  selection,
  tags,
}: ReadingAnnotationToolbarProps) {
  const { floatingStyles, getFloatingProps, refs } = useAnchoredFloating(anchor, {
    boundary,
    offset: 8,
    onDismiss: onCancel,
    placement: "top",
  });
  const englishTags = tags.filter((tag) => tag.group === "english");
  const generalTags = tags.filter((tag) => tag.group === "general");

  return createPortal(
    <div
      ref={refs.setFloating}
      className="z-50 flex max-w-full flex-wrap items-center gap-1 overflow-hidden rounded-md border-2 border-border bg-popover p-1.5 text-popover-foreground shadow-[var(--hard-shadow)]"
      style={floatingStyles}
      {...getFloatingProps()}
    >
      <div className="hidden max-w-40 truncate px-1 text-[10px] font-semibold text-muted-foreground lg:block">
        {selection.text}
      </div>
      {englishTags.map((tag) => (
        <TagButton key={tag.id} onClick={() => onHighlight(tag)} tag={tag} />
      ))}
      {englishTags.length > 0 && generalTags.length > 0 ? (
        <span className="mx-0.5 h-5 border-l border-border" />
      ) : null}
      {generalTags.map((tag) => (
        <TagButton key={tag.id} onClick={() => onHighlight(tag)} tag={tag} />
      ))}
      <span className="mx-0.5 h-5 border-l border-border" />
      <Button
        aria-label="解释选中文本"
        className="gap-1"
        onClick={() => onAsk("解释这段文字，并结合上下文说明它的含义。")}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Sparkles />
        解释
      </Button>
      <Button
        aria-label="举一个例子"
        onClick={() => onAsk("为这段文字举一个具体、易懂的例子。")}
        size="icon-sm"
        title="举例"
        type="button"
        variant="ghost"
      >
        <Lightbulb />
      </Button>
      <Button aria-label="取消划线" onClick={onCancel} size="icon-sm" type="button" variant="ghost">
        <X />
      </Button>
    </div>,
    document.body,
  );
}

function TagButton({ onClick, tag }: { onClick(): void; tag: BrowserReadingTag }) {
  return (
    <button
      className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-1.5 text-[11px] font-bold hover:bg-muted"
      onClick={onClick}
      title={`标记为${tag.name}`}
      type="button"
    >
      <span
        aria-hidden="true"
        className="size-3 rounded-[2px] border border-border"
        style={{ backgroundColor: tag.color }}
      />
      <BookOpenText className="size-3" />
      {tag.displayLabel || tag.name}
    </button>
  );
}
