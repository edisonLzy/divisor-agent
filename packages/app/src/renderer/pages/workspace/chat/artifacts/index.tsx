import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { Button } from "@renderer/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { UnknownArtifact } from "@renderer/extensions/fallback-renderers";
import { cn } from "@renderer/lib/utils";
import { sessionStore, type ArtifactRecord, type SideChatArtifactRecord } from "@renderer/store";
import { GripVertical, PanelRightClose, PuzzleIcon, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useStore } from "zustand";

import { SideChatArtifact } from "./side-chat-artifact";

interface ArtifactsPanelProps {
  className?: string;
  sessionId: string;
}

export function ArtifactsPanel({ className, sessionId }: ArtifactsPanelProps) {
  const artifactState = useStore(sessionStore, (state) => state.getArtifactState(sessionId));
  const setActiveArtifactId = useStore(sessionStore, (state) => state.setActiveArtifactId);
  const setArtifactPanelOpen = useStore(sessionStore, (state) => state.setArtifactPanelOpen);
  const removeArtifact = useStore(sessionStore, (state) => state.removeArtifact);
  const reorderArtifacts = useStore(sessionStore, (state) => state.reorderArtifacts);
  const [draggedArtifactId, setDraggedArtifactId] = useState<string | null>(null);

  const artifacts = artifactState.artifacts;
  const activeArtifactId = artifactState.activeArtifactId ?? artifacts[0]?.id ?? "";
  const activeArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === activeArtifactId) ?? null,
    [activeArtifactId, artifacts],
  );

  const handleCloseArtifact = useCallback(
    (artifactId: string) => {
      removeArtifact(sessionId, artifactId);
    },
    [removeArtifact, sessionId],
  );

  const handleDrop = useCallback(
    (targetArtifactId: string) => {
      if (!draggedArtifactId || draggedArtifactId === targetArtifactId) return;

      const sourceIndex = artifacts.findIndex((artifact) => artifact.id === draggedArtifactId);
      const targetIndex = artifacts.findIndex((artifact) => artifact.id === targetArtifactId);
      reorderArtifacts(sessionId, sourceIndex, targetIndex);
      setDraggedArtifactId(null);
    },
    [artifacts, draggedArtifactId, reorderArtifacts, sessionId],
  );

  return (
    <aside
      className={cn(
        "flex h-full min-w-90 flex-col border-l border-border/70 bg-background/80 supports-backdrop-filter:backdrop-blur-xl",
        className,
      )}
    >
      <Tabs
        value={activeArtifactId}
        onValueChange={(value) => setActiveArtifactId(sessionId, value)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex h-10 shrink-0 items-center border-b border-border/70 px-2">
          <TabsList
            variant="line"
            className="h-full min-w-0 flex-1 justify-start overflow-x-auto rounded-none p-0"
          >
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                draggable
                className="group/tab flex h-9 max-w-48 shrink-0 items-center"
                onDragStart={() => setDraggedArtifactId(artifact.id)}
                onDragEnd={() => setDraggedArtifactId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(artifact.id)}
              >
                <TabsTrigger
                  value={artifact.id}
                  className="h-full min-w-0 flex-1 basis-auto justify-start gap-1 rounded-none px-2 text-xs"
                >
                  <GripVertical className="text-muted-foreground/70" />
                  <span className="truncate">{artifact.name}</span>
                </TabsTrigger>
                <button
                  type="button"
                  className="mr-1 grid size-4 place-items-center rounded-sm text-muted-foreground/70 opacity-70 hover:bg-muted hover:text-foreground group-hover/tab:opacity-100"
                  aria-label={`Close ${artifact.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseArtifact(artifact.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    handleCloseArtifact(artifact.id);
                  }}
                >
                  <X />
                </button>
              </div>
            ))}
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-1 shrink-0"
            aria-label="Close artifacts panel"
            onClick={() => setArtifactPanelOpen(sessionId, false)}
          >
            <PanelRightClose />
          </Button>
        </div>

        {activeArtifact ? (
          <TabsContent value={activeArtifact.id} className="min-h-0 overflow-hidden">
            <ArtifactContent artifact={activeArtifact} mainSessionId={sessionId} />
          </TabsContent>
        ) : (
          <TabsContent value="" className="min-h-0">
            <ArtifactEmptyState />
          </TabsContent>
        )}
      </Tabs>
    </aside>
  );
}

function ArtifactContent({
  artifact,
  mainSessionId,
}: {
  artifact: ArtifactRecord;
  mainSessionId: string;
}) {
  if (artifact.type === "side-chat") {
    return (
      <SideChatArtifact
        artifact={artifact as SideChatArtifactRecord}
        mainSessionId={mainSessionId}
      />
    );
  }

  return (
    <div className="h-full overflow-auto bg-background p-3">
      <ArtifactPreview artifact={artifact} />
    </div>
  );
}

export function ArtifactPreview({ artifact }: { artifact: ArtifactRecord }) {
  const registry = useExtensionRegistry();
  const registration = registry.getArtifact(artifact.type);

  if (!registration) {
    return (
      <div className="p-3">
        <UnknownArtifact raw={artifact.raw ?? ""} type={artifact.type} />
      </div>
    );
  }

  const Renderer = registration.render;
  return (
    <div className="h-full min-h-full">
      <Renderer artifactId={artifact.id} props={artifact.props ?? {}} raw={artifact.raw ?? ""} />
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
        <div className="text-sm font-medium text-foreground">No artifact selected</div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Select an artifact tab to view its content.
        </p>
      </div>
    </div>
  );
}
