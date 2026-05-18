import { cn } from "@renderer/lib/utils";

interface TitlebarProps {
  children?: React.ReactNode;
}

export function Titlebar({ children }: TitlebarProps) {
  return (
    <div
      className={cn(
        "flex h-11.5 shrink-0 items-center gap-3 bg-sidebar border-b border-sidebar-border",
        "pl-20 pr-4 select-none",
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
