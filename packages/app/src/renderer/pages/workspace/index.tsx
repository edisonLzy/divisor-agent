import { Titlebar } from "@renderer/components/titlebar";
import { Button } from "@renderer/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { sessionStore } from "@renderer/store";
import { PanelRightOpen, PuzzleIcon, X } from "lucide-react";
import { useCallback } from "react";
import { useStore } from "zustand";

import { Artifacts } from "./artifacts";
import { ArtifactPreview } from "./artifacts";
import { Chat } from "./chat";
import { Sessions } from "./sessions";
import { SideChatPanel } from "./sidechat/sidechat-panel";
import { ToggleSidebarButton, useToggleSidebarButton } from "./toggle-sidebar-button";
import { useAgentMessages } from "./use-agent-messages";
import { useAgentSessions } from "./use-agent-sessions";

export function WorkspacePage() {
  const { isCollapsed, panelRef, setIsCollapsed, toggle } = useToggleSidebarButton();
  const activeSessionId = useStore(sessionStore, (state) => state.activeSessionId);

  // Artifact state
  const artifactState = useStore(sessionStore, (state) =>
    activeSessionId ? (state.artifactStates.get(activeSessionId) ?? null) : null,
  );
  const setArtifactPanelOpen = useStore(sessionStore, (state) => state.setArtifactPanelOpen);
  const activeArtifact =
    artifactState?.artifacts.find((artifact) => artifact.id === artifactState.activeArtifactId) ??
    null;
  const hasArtifacts = (artifactState?.artifacts.length ?? 0) > 0;
  const isArtifactOpen = Boolean(activeSessionId && artifactState?.isOpen && hasArtifacts);

  // Side chat state
  const sideChatState = useStore(sessionStore, (state) =>
    activeSessionId ? state.getSideChatState(activeSessionId) : null,
  );
  const closeSideChat = useStore(sessionStore, (state) => state.closeSideChat);
  const setActiveSideChat = useStore(sessionStore, (state) => state.setActiveSideChat);
  const setSideChatPanelOpen = useStore(sessionStore, (state) => state.setSideChatPanelOpen);

  const sideChats = sideChatState?.sideChats ?? [];
  const activeSideChatId = sideChatState?.activeSideChatId ?? null;
  const isSideChatPanelOpen = sideChatState?.isPanelOpen ?? false;
  const hasSideChats = sideChats.length > 0;

  const hasRightPanelContent = hasArtifacts || hasSideChats;
  const isTabbedMode = hasSideChats;
  const isRightPanelOpen =
    activeSessionId !== null &&
    (isArtifactOpen || (isSideChatPanelOpen && hasSideChats)) &&
    hasRightPanelContent;

  const handleCloseSideChat = useCallback(
    (sideChatId: string) => {
      if (!activeSessionId) return;
      const confirmed = window.confirm("侧边聊天内容将丢失，确定关闭吗？");
      if (!confirmed) return;
      closeSideChat(activeSessionId, sideChatId);
    },
    [activeSessionId, closeSideChat],
  );

  const handleOpenRightPanel = useCallback(() => {
    if (!activeSessionId) return;
    if (hasArtifacts) setArtifactPanelOpen(activeSessionId, true);
    if (hasSideChats) setSideChatPanelOpen(activeSessionId, true);
  }, [activeSessionId, hasArtifacts, hasSideChats, setArtifactPanelOpen, setSideChatPanelOpen]);

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
          defaultSize={isRightPanelOpen ? "46%" : "74%"}
          minSize={isRightPanelOpen ? "34%" : "60%"}
        >
          <div className="relative flex h-full w-full bg-sidebar/78 supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
            {activeSessionId && hasRightPanelContent && !isRightPanelOpen ? (
              <div className="absolute right-3 top-11 z-10">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="rounded-lg border border-border/70 bg-background/90 shadow-sm supports-backdrop-filter:backdrop-blur-xl"
                  onClick={handleOpenRightPanel}
                  aria-label="Open right panel"
                >
                  <PanelRightOpen />
                </Button>
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <Chat />
            </div>
          </div>
        </ResizablePanel>

        {/* Artifact-only: use original Artifacts component (no tabs) */}
        {isArtifactOpen && !isTabbedMode && activeSessionId ? (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="28%" minSize="20%" maxSize="46%">
              <Artifacts
                activeArtifact={activeArtifact ?? undefined}
                onClose={() => setArtifactPanelOpen(activeSessionId, false)}
              />
            </ResizablePanel>
          </>
        ) : null}

        {/* Tabbed mode: artifacts + side chats */}
        {isTabbedMode && isSideChatPanelOpen && activeSessionId ? (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="28%" minSize="20%" maxSize="46%">
              <RightPanel
                activeArtifact={activeArtifact}
                activeSideChat={
                  activeSideChatId
                    ? (sideChats.find((sc) => sc.id === activeSideChatId) ?? null)
                    : null
                }
                hasArtifacts={hasArtifacts && isArtifactOpen}
                mainSessionId={activeSessionId}
                sideChats={sideChats}
                activeTab={activeSideChatId ?? (hasArtifacts && isArtifactOpen ? "artifact" : null)}
                onActivateArtifact={() => {
                  setActiveSideChat(activeSessionId, null);
                }}
                onActivateSideChat={(id) => {
                  setActiveSideChat(activeSessionId, id);
                }}
                onClose={() => {
                  setArtifactPanelOpen(activeSessionId, false);
                  setSideChatPanelOpen(activeSessionId, false);
                }}
                onCloseSideChat={handleCloseSideChat}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}

// ── Right Panel (tabbed mode) ────────────────────────────────────────────────

interface RightPanelProps {
  activeTab: string | null;
  activeArtifact: import("@renderer/store").ArtifactRecord | null;
  activeSideChat: import("@renderer/store").SideChatSession | null;
  hasArtifacts: boolean;
  mainSessionId: string;
  sideChats: import("@renderer/store").SideChatSession[];
  onActivateArtifact: () => void;
  onActivateSideChat: (id: string) => void;
  onClose: () => void;
  onCloseSideChat: (id: string) => void;
}

function RightPanel({
  activeTab,
  activeArtifact,
  activeSideChat,
  hasArtifacts,
  mainSessionId,
  sideChats,
  onActivateArtifact,
  onActivateSideChat,
  onClose,
  onCloseSideChat,
}: RightPanelProps) {
  return (
    <aside className="flex h-full flex-col border-l border-border/70 bg-background/80 supports-backdrop-filter:backdrop-blur-xl">
      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center border-b border-border/70">
        <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto">
          {hasArtifacts && (
            <TabButton
              isActive={activeTab === "artifact"}
              label="Artifact"
              onClick={onActivateArtifact}
            />
          )}
          {sideChats.map((sc) => (
            <TabButton
              key={sc.id}
              isActive={activeTab === sc.id}
              label={sc.name}
              onClose={() => onCloseSideChat(sc.id)}
              onClick={() => onActivateSideChat(sc.id)}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mr-1 h-6 w-6 shrink-0"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1">
        {activeTab === "artifact" && (
          <div className="h-full">
            {activeArtifact ? <ArtifactsInner artifact={activeArtifact} /> : <ArtifactEmptyState />}
          </div>
        )}
        {activeTab && activeTab !== "artifact" && activeSideChat && (
          <SideChatPanel mainSessionId={mainSessionId} sideChat={activeSideChat} />
        )}
        {!activeTab && <ArtifactEmptyState />}
      </div>
    </aside>
  );
}

// ── Tab Button ───────────────────────────────────────────────────────────────

interface TabButtonProps {
  isActive: boolean;
  label: string;
  onClick: () => void;
  onClose?: () => void;
}

function TabButton({ isActive, label, onClick, onClose }: TabButtonProps) {
  return (
    <button
      type="button"
      className={`group flex h-9 shrink-0 items-center gap-1 border-r border-border/70 px-3 text-xs transition-colors ${
        isActive
          ? "bg-background text-foreground"
          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
      }`}
      onClick={onClick}
    >
      <span className="max-w-32 truncate">{label}</span>
      {onClose && (
        <span
          className="ml-0.5 flex size-4 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted-foreground/15 hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          role="button"
          aria-label="Close tab"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  );
}

// ── Simplified Artifacts inner ────────────────────────────────────────────────

interface ArtifactsInnerProps {
  artifact: import("@renderer/store").ArtifactRecord;
}

function ArtifactsInner({ artifact }: ArtifactsInnerProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm m-4">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-muted/40 px-2">
        <span className="size-2.5 rounded-full bg-destructive/70" />
        <span className="size-2.5 rounded-full bg-muted-foreground/40" />
        <span className="size-2.5 rounded-full bg-primary/70" />
        <span className="ml-2 truncate text-xs text-muted-foreground">{artifact.type}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-background">
        <div className="h-full min-h-full p-3">
          <ArtifactPreview artifact={artifact} />
        </div>
      </div>
    </div>
  );
}

function ArtifactEmptyState() {
  return (
    <div className="grid h-full min-h-80 place-items-center">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg border border-dashed border-border bg-muted/40">
          <PuzzleIcon className="text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-foreground">No content selected</div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Select an artifact or side chat tab to view content.
        </p>
      </div>
    </div>
  );
}
