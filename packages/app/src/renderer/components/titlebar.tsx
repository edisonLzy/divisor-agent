import { cn } from "@renderer/lib/utils";
import { PanelLeft } from "lucide-react";

interface TitlebarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function Titlebar({ sidebarCollapsed, onToggleSidebar }: TitlebarProps) {
  return (
    <div
      className={cn(
        "flex h-[45px] shrink-0 items-center gap-3 bg-sidebar border-b border-sidebar-border",
        "pl-[80px] pr-4 select-none",
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="flex items-center justify-center rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
      >
        <PanelLeft className="size-4" />
      </button>

      {/* Title / breadcrumb */}
      <span className="text-[13px] font-medium text-sidebar-foreground/80">divisor-agent</span>
    </div>
  );
}
