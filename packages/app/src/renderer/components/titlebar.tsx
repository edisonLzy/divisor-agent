import { cn } from "@renderer/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  windowControls?: "left" | "right" | "both" | "none";
}

export function Titlebar({ children, className, style, windowControls = "none" }: TitlebarProps) {
  return (
    <div
      className={cn(
        "relative flex h-12 shrink-0 items-center gap-3 border-b-2 border-border bg-accent px-3 select-none",
        (windowControls === "left" || windowControls === "both") &&
          "pl-[calc(var(--window-controls-left)+0.75rem)]",
        (windowControls === "right" || windowControls === "both") &&
          "pr-[calc(var(--window-controls-right)+0.75rem)]",
        className,
      )}
      style={{ WebkitAppRegion: "drag", ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
