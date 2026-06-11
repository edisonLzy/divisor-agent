import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { Button } from "@renderer/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { UnknownArtifact } from "@renderer/extensions/fallback-renderers";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import type { ArtifactRecord } from "@renderer/store/main/artifact-slice";
import type { SideChatArtifactRecord } from "@renderer/store/side-chat/side-chat-slice";
import {
  Code2,
  FileText,
  ImageIcon,
  MessageSquareText,
  Package,
  PuzzleIcon,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { type DragEvent, useCallback, useMemo, useState } from "react";
import { useStore } from "zustand";

import { PanelHeader } from "../panel-header";
import { SideChatArtifact } from "./side-chat-artifact";

interface ArtifactsPanelProps {
  className?: string;
  sessionId: string;
}

export function ArtifactsPanel({ className, sessionId }: ArtifactsPanelProps) {
  const artifactState = useStore(mainStore, (state) => state.getArtifactState(sessionId));
  const setActiveArtifactId = useStore(mainStore, (state) => state.setActiveArtifactId);
  const removeArtifact = useStore(mainStore, (state) => state.removeArtifact);
  const reorderArtifacts = useStore(mainStore, (state) => state.reorderArtifacts);
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
        <PanelHeader className="pl-2">
          <div className="relative min-w-0 flex-1">
            <TabsList
              variant="line"
              className="h-9 w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-none p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {artifacts.map((artifact) => (
                <ArtifactTab
                  key={artifact.id}
                  artifact={artifact}
                  onClose={handleCloseArtifact}
                  onDragStart={() => setDraggedArtifactId(artifact.id)}
                  onDragEnd={() => setDraggedArtifactId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(artifact.id)}
                />
              ))}
            </TabsList>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
          </div>
        </PanelHeader>

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

interface ArtifactTabProps {
  artifact: ArtifactRecord;
  onClose: (artifactId: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragStart: () => void;
  onDrop: () => void;
}

function ArtifactTab({
  artifact,
  onClose,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
}: ArtifactTabProps) {
  const Icon = getArtifactIcon(artifact.type);

  return (
    <div
      draggable
      className="group/tab relative flex h-9 max-w-48 shrink-0 items-center"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <TabsTrigger
        value={artifact.id}
        className="h-8 min-w-0 max-w-48 justify-start gap-2 rounded-lg px-3 text-sm data-active:bg-muted data-active:after:opacity-0"
      >
        <span className="grid size-4 shrink-0 place-items-center text-muted-foreground transition-opacity group-hover/tab:opacity-0">
          <Icon />
        </span>
        <span className="truncate">{artifact.name}</span>
      </TabsTrigger>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute left-2 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
        aria-label={`Close ${artifact.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onClose(artifact.id);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onClose(artifact.id);
        }}
      >
        <X />
      </Button>
    </div>
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

function getArtifactIcon(type: string): LucideIcon {
  const normalizedType = type.toLowerCase();

  if (normalizedType === "side-chat") return MessageSquareText;
  if (normalizedType.includes("code") || normalizedType.includes("html")) return Code2;
  if (normalizedType.includes("table") || normalizedType.includes("csv")) return Table2;
  if (normalizedType.includes("image")) return ImageIcon;
  if (normalizedType.includes("doc") || normalizedType.includes("text")) return FileText;
  if (normalizedType.includes("example")) return Package;

  return PuzzleIcon;
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
