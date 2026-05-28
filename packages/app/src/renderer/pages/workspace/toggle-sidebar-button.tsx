// Hand-drawn PanelLeft icon
function HandPanelLeft({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3.7 4.3c.3-.5.8-.6 1.4-.7L18.6 3.3c.6 0 1.2 0 1.4.3.3.3.4.8.4 1.4v13.8c0 .6 0 1.1-.4 1.4-.2.3-.8.3-1.4.3H5.3c-.6 0-1.1 0-1.4-.3-.3-.3-.3-.8-.3-1.4V5.7c-.1-.6 0-1.1.1-1.4z" />
      <path d="M8.8 3.5c.1 1 0 16.8 0 16.8" />
    </svg>
  );
}

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
      <HandPanelLeft className="size-4" />
    </button>
  );
}
