import { Button } from "@renderer/components/ui/button";
import { PanelRightOpen } from "lucide-react";
import { useEffect, useRef } from "react";

interface SelectionPopupProps {
  position: { x: number; y: number };
  onOpen: (selectedText: string) => void;
  onDismiss: () => void;
}

export function SelectionPopup({ position, onOpen, onDismiss }: SelectionPopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Click outside to dismiss
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onDismiss]);

  return (
    <div
      ref={popupRef}
      className="pointer-events-auto fixed z-50 -translate-x-1/2 -translate-y-full"
      style={{ left: position.x, top: position.y }}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1 rounded-lg border border-border/70 bg-background/95 px-2.5 text-xs shadow-md supports-backdrop-filter:backdrop-blur-xl"
        onClick={() => {
          const selection = window.getSelection();
          if (selection) {
            onOpen(selection.toString().trim());
          }
        }}
      >
        <PanelRightOpen className="size-3" />
        在侧边栏深入讨论
      </Button>
    </div>
  );
}
