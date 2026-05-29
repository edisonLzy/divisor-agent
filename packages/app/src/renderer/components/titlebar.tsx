import { cn } from "@renderer/lib/utils";

interface TitlebarProps {
  children?: React.ReactNode;
}

export function Titlebar({ children }: TitlebarProps) {
  return (
    <div
      className={cn(
        "absolute top-0 left-0 right-0 z-10 flex h-9 items-center gap-3",
        "pl-20 pr-4 select-none",
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
