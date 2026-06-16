import { cn } from "@renderer/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface PanelHeaderProps {
  children: ReactNode;
  className?: string;
  dragRegion?: boolean;
  insetForWindowControls?: boolean;
}

interface FixedActionsProps {
  children: ReactNode;
  className?: string;
}

export function PanelHeader({
  children,
  className,
  dragRegion = false,
  insetForWindowControls = false,
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        "relative flex h-9 shrink-0 items-center border-b border-border/70 px-4 pr-14",
        dragRegion && "app-drag-region",
        insetForWindowControls && "pl-28",
        className,
      )}
    >
      {dragRegion && insetForWindowControls ? (
        // Carve out the global sidebar toggle area from Electron's native drag region.
        <span aria-hidden className="app-no-drag absolute top-0 bottom-0 left-0 z-10 w-32" />
      ) : null}
      {children}
    </header>
  );
}

export function FixedActions({ children, className }: FixedActionsProps) {
  return (
    <div
      className={cn(
        "app-no-drag pointer-events-none absolute right-3 top-1 z-50 flex h-7 items-center gap-2 [&>*]:pointer-events-auto",
        className,
      )}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      {children}
    </div>
  );
}
