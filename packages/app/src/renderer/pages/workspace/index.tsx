import { Titlebar } from "@renderer/components/titlebar";
import { Button } from "@renderer/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { sessionStore } from "@renderer/store";
import { PanelRightOpen } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";

import { Artifacts } from "./artifacts";
import { Chat } from "./chat";
import { Sessions } from "./sessions";
import { ToggleSidebarButton, useToggleSidebarButton } from "./toggle-sidebar-button";
import { useAgentMessages } from "./use-agent-messages";
import { useAgentSessions } from "./use-agent-sessions";

export function WorkspacePage() {
  const { isCollapsed, panelRef, setIsCollapsed, toggle } = useToggleSidebarButton();
  const activeSessionId = useStore(sessionStore, (state) => state.activeSessionId);
  const [isArtifactOpen, setIsArtifactOpen] = useState(true);
  const canShowArtifact = Boolean(activeSessionId);

  void useAgentMessages();

  void useAgentSessions();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-transparent font-sans text-foreground">
      <Titlebar>
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
          onResize={(size) => setIsCollapsed(size.asPercentage === 0)}
        >
          <Sessions />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel
          defaultSize={canShowArtifact && isArtifactOpen ? "46%" : "74%"}
          minSize={canShowArtifact && isArtifactOpen ? "34%" : "60%"}
        >
          <div className="relative flex h-full w-full bg-sidebar/78 supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
            {canShowArtifact && !isArtifactOpen ? (
              <div className="absolute right-3 top-11 z-10">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="rounded-lg border border-border/70 bg-background/90 shadow-sm supports-backdrop-filter:backdrop-blur-xl"
                  onClick={() => setIsArtifactOpen(true)}
                  aria-label="Open artifact panel"
                >
                  <PanelRightOpen className="size-3.5" />
                </Button>
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <Chat />
            </div>
          </div>
        </ResizablePanel>

        {canShowArtifact && isArtifactOpen ? (
          <>
            <ResizableHandle />

            <ResizablePanel defaultSize="28%" minSize="20%" maxSize="46%">
              <Artifacts onClose={() => setIsArtifactOpen(false)} />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}
