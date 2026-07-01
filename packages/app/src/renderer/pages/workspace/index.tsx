import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";

import { Chat } from "./chat";
import { useSideChatMessages } from "./chat/artifacts/side-chat-artifact/use-side-chat-messages";
import { Sessions } from "./sessions";
import { useToggleSidebarButton } from "./toggle-sidebar-button";
import { useAgentMessages } from "./use-agent-messages";
import { useAgentSessions } from "./use-agent-sessions";

export function WorkspacePage() {
  const { isCollapsed, panelRef, setIsCollapsed, toggle } = useToggleSidebarButton();

  void useAgentMessages();
  void useSideChatMessages();
  void useAgentSessions();

  return (
    <div className="h-screen w-full overflow-hidden bg-background font-sans text-foreground">
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full [&>[data-panel]]:transition-[flex-grow] [&>[data-panel]]:duration-200 [&>[data-panel]]:ease-out"
      >
        <ResizablePanel
          panelRef={panelRef}
          collapsible
          collapsedSize="0%"
          defaultSize="22%"
          minSize="16%"
          maxSize="30%"
          onResize={(size) => {
            setIsCollapsed(size.asPercentage < 0.5);
          }}
        >
          <Sessions />
        </ResizablePanel>

        <ResizableHandle className="w-0.5 bg-border" />

        <ResizablePanel defaultSize="78%" minSize="60%">
          <div className="flex h-full w-full bg-background">
            <div className="min-w-0 flex-1">
              <Chat isSidebarCollapsed={isCollapsed} onToggleSidebar={toggle} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
