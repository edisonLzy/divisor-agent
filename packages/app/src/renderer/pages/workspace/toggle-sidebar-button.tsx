import { PanelLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { usePanelRef } from "react-resizable-panels";

type UseToggleSidebarReturn = ReturnType<typeof useToggleSidebarButton>;

export function useToggleSidebarButton() {
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [panelRef]);

  return { isCollapsed, panelRef, setIsCollapsed, toggle };
}

type ToggleSidebarButtonProps = {
  isCollapsed: UseToggleSidebarReturn["isCollapsed"];
  onToggle: UseToggleSidebarReturn["toggle"];
};

export function ToggleSidebarButton(props: ToggleSidebarButtonProps) {
  const { isCollapsed, onToggle } = props;

  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-center rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      title={isCollapsed ? "展开侧栏" : "折叠侧栏"}
    >
      <PanelLeft className="size-4" />
    </button>
  );
}
