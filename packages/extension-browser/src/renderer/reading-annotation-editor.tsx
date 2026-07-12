import { Button } from "@renderer/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Textarea } from "@renderer/components/ui/textarea";
import {
  BookOpenText,
  ChevronDown,
  Eraser,
  Eye,
  Filter,
  Lightbulb,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Streamdown } from "streamdown";

import type { BrowserReadingAnnotation, BrowserReadingTag } from "../common/types";
import { useAnchoredFloating, type ScreenPoint } from "./annotation-floating";

interface ReadingAnnotationEditorProps {
  activeTagId: string | null;
  anchor: ScreenPoint;
  annotation: BrowserReadingAnnotation;
  boundary: HTMLElement | null;
  onAsk(instruction: string): void;
  onClose(): void;
  onDelete(): void;
  onNavigate(direction: -1 | 1): void;
  onNoteChange(content: string): void;
  onTagChange(tag: BrowserReadingTag): void;
  onToggleTagFilter(): void;
  tags: readonly BrowserReadingTag[];
}

/** Edit an existing highlight without taking space away from the browser page. */
export function ReadingAnnotationEditor({
  activeTagId,
  anchor,
  annotation,
  boundary,
  onAsk,
  onClose,
  onDelete,
  onNavigate,
  onNoteChange,
  onTagChange,
  onToggleTagFilter,
  tags,
}: ReadingAnnotationEditorProps) {
  const [content, setContent] = useState(annotation.note.content);
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { floatingStyles, getFloatingProps, refs } = useAnchoredFloating(anchor, {
    boundary,
    offset: 10,
    onDismiss: onClose,
    placement: "bottom",
  });

  useEffect(() => {
    setContent(annotation.note.content);
    setEditing(false);
  }, [annotation.id, annotation.note.content]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (content === annotation.note.content) return;
    const timeout = window.setTimeout(() => onNoteChange(content), 600);
    return () => window.clearTimeout(timeout);
  }, [annotation.note.content, content, onNoteChange]);

  return createPortal(
    <section
      ref={refs.setFloating}
      className="z-50 flex w-[23rem] max-w-full flex-col overflow-hidden rounded-md border-2 border-border bg-popover text-sm text-popover-foreground shadow-[var(--hard-shadow)]"
      style={floatingStyles}
      {...getFloatingProps()}
    >
      <div className="flex items-center justify-between border-b-2 border-border bg-secondary px-2 py-1.5">
        <Select
          onValueChange={(id) => {
            const tag = tags.find((candidate) => candidate.id === id);
            if (tag) onTagChange(tag);
          }}
          value={annotation.tag.id}
        >
          <SelectTrigger
            className="border-0 bg-transparent px-1 text-xs font-bold shadow-none"
            size="sm"
          >
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-[2px] border border-border"
                  style={{ backgroundColor: annotation.tag.color }}
                />
                {annotation.tag.displayLabel || annotation.tag.name}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-[2px] border border-border"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.displayLabel || tag.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0.5">
          <Button
            aria-label={activeTagId === annotation.tag.id ? "显示所有批注" : "只看此标签"}
            onClick={onToggleTagFilter}
            size="icon-xs"
            title={activeTagId === annotation.tag.id ? "显示所有批注" : "只看此标签"}
            type="button"
            variant={activeTagId === annotation.tag.id ? "secondary" : "ghost"}
          >
            <Filter />
          </Button>
          <Button
            aria-label="上一条批注"
            onClick={() => onNavigate(-1)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronDown className="rotate-180" />
          </Button>
          <Button
            aria-label="下一条批注"
            onClick={() => onNavigate(1)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
          <Button
            aria-label="关闭批注"
            onClick={onClose}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="px-3 pb-2 pt-2">
        <div className="break-words border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
          {annotation.text}
        </div>
        {annotation.sentence && annotation.sentence !== annotation.text ? (
          <p className="mt-1 text-[10px] leading-normal text-muted-foreground">
            {annotation.sentence}
          </p>
        ) : null}
      </div>
      <div className="flex gap-1 border-y border-border px-2 py-1.5">
        <Button
          className="gap-1 text-[11px]"
          onClick={() => onAsk("解释这段高亮文字，并结合文章上下文回答。")}
          size="xs"
          type="button"
          variant="secondary"
        >
          <Sparkles />
          解释
        </Button>
        <Button
          className="gap-1 text-[11px]"
          onClick={() => onAsk("为这段高亮文字举一个具体例子。")}
          size="xs"
          type="button"
          variant="ghost"
        >
          <Lightbulb />
          举例
        </Button>
      </div>
      <div className="p-2">
        {editing ? (
          <Textarea
            ref={textareaRef}
            className="min-h-20 resize-y text-xs"
            onBlur={() => setEditing(false)}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setContent(annotation.note.content);
                setEditing(false);
              }
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                onNoteChange(content);
                setEditing(false);
              }
            }}
            placeholder="写下你的理解或问题… 支持 Markdown"
            value={content}
          />
        ) : (
          <div
            className="min-h-20 w-full break-words rounded-sm border border-dashed border-border bg-card px-2 py-1.5 text-left text-xs leading-relaxed hover:bg-muted"
            onClick={() => setEditing(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setEditing(true);
              }
            }}
            role="button"
            tabIndex={0}
          >
            {content ? (
              <Streamdown className="prose prose-sm max-w-none text-xs">{content}</Streamdown>
            ) : (
              <span className="text-muted-foreground">点击撰写备注，支持 Markdown</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <BookOpenText className="size-3" /> 自动保存
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            aria-label="清空备注"
            onClick={() => {
              setContent("");
              setEditing(false);
            }}
            size="icon-xs"
            title="清空备注"
            type="button"
            variant="ghost"
          >
            <Eraser />
          </Button>
          <Button
            aria-label={editing ? "预览备注" : "编辑备注"}
            onClick={() => setEditing(!editing)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {editing ? <Eye /> : <Pencil />}
          </Button>
          <Button
            aria-label="删除批注"
            className="text-destructive"
            onClick={onDelete}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </section>,
    document.body,
  );
}
