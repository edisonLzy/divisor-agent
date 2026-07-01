import { cn } from "@renderer/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface TitlebarProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Titlebar({ children, className, style }: TitlebarProps) {
  return (
    <div
      className={cn(
        "relative flex h-11 shrink-0 items-center gap-3 border-b-2 border-border bg-accent",
        "pl-20 pr-4 select-none",
        className,
      )}
      style={{ WebkitAppRegion: "drag", ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
