import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { Separator } from "@renderer/components/ui/separator";
import { ChevronDown, ChevronUp, Highlighter, ListFilter, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import type { BrowserReadingTag } from "../common/types";

interface ReadingAnnotationActionsProps {
  activeTagId: string | null;
  enabled: boolean;
  onFilter(tagId: string | null): void;
  onNavigate(direction: -1 | 1): void;
  onOpenChange(open: boolean): void;
  onToggle(): void;
  open: boolean;
  tags: readonly BrowserReadingTag[];
  visibleAnnotationCount: number;
  visibleAnnotationPosition: number | null;
}

/** A persistent, artifact-local control surface for reading annotations. */
export function ReadingAnnotationActions({
  activeTagId,
  enabled,
  onFilter,
  onNavigate,
  onOpenChange,
  onToggle,
  open,
  tags,
  visibleAnnotationCount,
  visibleAnnotationPosition,
}: ReadingAnnotationActionsProps) {
  const canNavigate = visibleAnnotationCount > 0;
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onOpenChange, open]);

  return (
    <div
      ref={actionsRef}
      className="z-20 flex w-80 flex-col items-end gap-2"
      style={{
        bottom: 12,
        maxWidth: "calc(100% - 1.5rem)",
        position: "absolute",
        right: 12,
      }}
    >
      {open ? (
        <Card aria-label="阅读批注操作" className="w-full" size="sm">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              <Highlighter aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">阅读批注</span>
              <Badge variant="secondary">{visibleAnnotationCount}</Badge>
            </CardTitle>
            <CardAction>
              <Button
                aria-label="关闭阅读批注操作"
                onClick={() => onOpenChange(false)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            <Button
              className="w-full justify-start"
              onClick={onToggle}
              size="sm"
              type="button"
              variant={enabled ? "secondary" : "outline"}
            >
              <Highlighter data-icon="inline-start" />
              {enabled ? "划线已开启" : "开启划线"}
            </Button>

            <Separator />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">切换高亮内容</span>
                <span className="text-muted-foreground">
                  {visibleAnnotationPosition ? `${visibleAnnotationPosition} / ` : ""}
                  {visibleAnnotationCount}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!canNavigate}
                  onClick={() => onNavigate(-1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronUp data-icon="inline-start" />
                  上一条
                </Button>
                <Button
                  disabled={!canNavigate}
                  onClick={() => onNavigate(1)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronDown data-icon="inline-start" />
                  下一条
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <ListFilter aria-hidden="true" className="size-3.5" />
                筛选标签
              </div>
              <div className="flex flex-wrap gap-1.5">
                <TagFilterButton active={activeTagId === null} onClick={() => onFilter(null)}>
                  全部
                </TagFilterButton>
                {tags.map((tag) => (
                  <TagFilterButton
                    active={activeTagId === tag.id}
                    key={tag.id}
                    onClick={() => onFilter(activeTagId === tag.id ? null : tag.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-[2px] border border-border"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.displayLabel || tag.name}
                  </TagFilterButton>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Button
        aria-expanded={open}
        aria-label="打开阅读批注操作"
        onClick={() => onOpenChange(!open)}
        size="sm"
        title="阅读批注操作"
        type="button"
        variant={open ? "secondary" : "default"}
      >
        <Highlighter data-icon="inline-start" />
        批注
      </Button>
    </div>
  );
}

function TagFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <Button
      aria-pressed={active}
      onClick={onClick}
      size="xs"
      type="button"
      variant={active ? "secondary" : "outline-flat"}
    >
      {children}
    </Button>
  );
}
