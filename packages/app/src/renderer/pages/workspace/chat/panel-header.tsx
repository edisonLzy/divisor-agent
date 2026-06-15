import { cn } from "@renderer/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface PanelHeaderProps {
  children: ReactNode;
  className?: string;
  dragRegion?: boolean;
}

interface FixedActionsProps {
  children: ReactNode;
  className?: string;
}

export function PanelHeader({ children, className, dragRegion = false }: PanelHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center border-b border-border/70 px-4 pr-14",
        dragRegion && "app-drag-region",
        className,
      )}
    >
      {children}
    </header>
  );
}

export function FixedActions({ children, className }: FixedActionsProps) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none absolute right-3 top-2.5 z-50 flex items-center gap-2 [&>*]:pointer-events-auto",
        className,
      )}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      {children}
    </div>
  );
}
