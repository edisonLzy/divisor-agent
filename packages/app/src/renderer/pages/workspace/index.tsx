import { appendEntries } from "@renderer/apis/sessions";
import { Titlebar } from "@renderer/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { sessionStore } from "@renderer/store/sessions";
import { useRef } from "react";

import { Chat } from "./chat";
import { Sessions } from "./sessions";
import { ToggleSidebarButton, useToggleSidebarButton } from "./toggle-sidebar-button";

function useAgentEventPersistence() {
  const entryCountAtStartRef = useRef<Record<string, number>>({});
  const hasPersistedRef = useRef<Record<string, boolean>>({});

  useSubscribeAgentEvents({
    agent_start: (event) => {
      const { sessionId } = event;
      const session = sessionStore.getState().getSession(sessionId);
      entryCountAtStartRef.current[sessionId] = session?.entries.length ?? 0;
      hasPersistedRef.current[sessionId] = false;
    },
    agent_end: async (event) => {
      const { sessionId } = event;

      // Avoid double-persist
      if (hasPersistedRef.current[sessionId]) return;
      hasPersistedRef.current[sessionId] = true;

      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const startCount = entryCountAtStartRef.current[sessionId] ?? 0;
      const newEntries = session.entries.slice(startCount);

      if (newEntries.length === 0) return;

      try {
        await appendEntries({
          sessionId,
          entries: newEntries.map((e) => ({
            parentId: e.parentId,
            type: e.type,
            data: e.data as unknown as Record<string, unknown>,
          })),
        });
        sessionStore.getState().setSessionStatus(sessionId, "completed");
      } catch (error) {
        console.error("Failed to persist entries:", error);
      }
    },
  });
}

export function WorkspacePage() {
  const { isCollapsed, panelRef, setIsCollapsed, toggle } = useToggleSidebarButton();

  useAgentEventPersistence();

  return (
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
  );
}
