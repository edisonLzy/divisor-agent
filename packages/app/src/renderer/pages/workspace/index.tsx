import { Titlebar } from "@renderer/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";

import { Chat } from "./chat";
import { WorkspaceSessionProvider } from "./session-provider";
import { Sessions } from "./sessions";
import { ToggleSidebarButton, useToggleSidebarButton } from "./toggle-sidebar-button";

export function WorkspacePage() {
  const { isCollapsed, panelRef, setIsCollapsed, toggle } = useToggleSidebarButton();

  return (
    <WorkspaceSessionProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-foreground">
        <Titlebar>
          <ToggleSidebarButton isCollapsed={isCollapsed} onToggle={toggle} />
          <span className="text-[13px] font-medium text-sidebar-foreground/80">divisor-agent</span>
        </Titlebar>
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel
            panelRef={panelRef}
            collapsible
            collapsedSize="0%"
            defaultSize="26%"
            minSize="18%"
            maxSize="32%"
            onResize={(size) => setIsCollapsed(size.asPercentage === 0)}
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
