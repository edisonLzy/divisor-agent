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
        "pointer-events-none absolute top-0 left-0 right-0 z-10 flex h-9 items-center gap-3 [&>*]:pointer-events-auto",
        "pl-20 pr-4 select-none",
        className,
      )}
      style={{ WebkitAppRegion: "no-drag", ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
