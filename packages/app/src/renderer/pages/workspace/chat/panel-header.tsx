import { cn } from "@renderer/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface PanelHeaderProps {
  children: ReactNode;
  className?: string;
  dragRegion?: boolean;
  windowControls?: "left" | "right" | "both" | "none";
}

interface FixedActionsProps {
  children: ReactNode;
  className?: string;
  reserveWindowControls?: boolean;
}

export function PanelHeader({
  children,
  className,
  dragRegion = false,
  windowControls = "none",
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        "relative flex h-12 shrink-0 items-center gap-2 border-b-2 border-border bg-card px-3 py-1 pr-14",
        dragRegion && "app-drag-region",
        (windowControls === "left" || windowControls === "both") &&
          "pl-[calc(var(--window-controls-left)+0.75rem)]",
        (windowControls === "right" || windowControls === "both") &&
          "pr-[calc(var(--window-controls-right)+0.75rem)]",
        className,
      )}
    >
      {children}
    </header>
  );
}

export function FixedActions({ children, className, reserveWindowControls }: FixedActionsProps) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none absolute top-2 right-3 z-50 flex h-8 items-center gap-2 [&>*]:pointer-events-auto",
        reserveWindowControls && "right-[calc(var(--window-controls-right)+0.75rem)]",
        className,
      )}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      {children}
    </div>
  );
}
