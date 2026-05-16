import { Titlebar } from "@renderer/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useState } from "react";
import { usePanelRef } from "react-resizable-panels";

import { Chat } from "./chat";
import { WorkspaceSessionProvider } from "./session-provider";
import { Sessions } from "./sessions";

export function WorkspacePage() {
  const sidebarRef = usePanelRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (sidebarCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  };

  return (
    <WorkspaceSessionProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-foreground">
        <Titlebar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel
            panelRef={sidebarRef}
            collapsible
            collapsedSize="0%"
            defaultSize="26%"
            minSize="18%"
            maxSize="32%"
            onResize={(size) => setSidebarCollapsed(size.asPercentage === 0)}
          >
            <Sessions />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize="74%" minSize="60%">
            <Chat />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </WorkspaceSessionProvider>
  );
}
