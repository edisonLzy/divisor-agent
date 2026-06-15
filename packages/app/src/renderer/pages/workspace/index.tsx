import { Titlebar } from "@renderer/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useState } from "react";

import { Chat } from "./chat";
import { useSideChatMessages } from "./chat/artifacts/side-chat-artifact/use-side-chat-messages";
import { Sessions } from "./sessions";
import { ToggleSidebarButton, useToggleSidebarButton } from "./toggle-sidebar-button";
import { useAgentMessages } from "./use-agent-messages";
import { useAgentSessions } from "./use-agent-sessions";

export function WorkspacePage() {
  const { isCollapsed, panelRef, setIsCollapsed, toggle } = useToggleSidebarButton();
  const [sidebarSize, setSidebarSize] = useState(26);
  const titlebarWidth = isCollapsed ? "8rem" : `max(8rem, ${sidebarSize}%)`;

  void useAgentMessages();
  void useSideChatMessages();
  void useAgentSessions();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-transparent font-sans text-foreground">
      <Titlebar style={{ width: titlebarWidth }}>
        <ToggleSidebarButton isCollapsed={isCollapsed} onToggle={toggle} />
      </Titlebar>
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel
          panelRef={panelRef}
          collapsible
          collapsedSize="0%"
          defaultSize="26%"
          minSize="18%"
          maxSize="32%"
          onResize={(size) => {
            setIsCollapsed(size.asPercentage === 0);
            setSidebarSize(size.asPercentage);
          }}
        >
          <Sessions />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="74%" minSize="60%">
          <div className="relative flex h-full w-full bg-sidebar/78 supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <Chat />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
