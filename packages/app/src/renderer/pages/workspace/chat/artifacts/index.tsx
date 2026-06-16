import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { Button } from "@renderer/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";
import { UnknownArtifact } from "@renderer/extensions/fallback-renderers";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import type { ArtifactRecord } from "@renderer/store/main/artifact-slice";
import type { SideChatArtifactRecord } from "@renderer/store/side-chat/side-chat-slice";
import {
  Blocks,
  Braces,
  FileCode2,
  FileText,
  Image,
  MessageSquareText,
  PackageOpen,
  Sparkles,
  TableProperties,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const artifacts = artifactState.artifacts;
  const artifactIds = useMemo(() => artifacts.map((artifact) => artifact.id), [artifacts]);
  const activeArtifactId = artifactState.activeArtifactId ?? artifacts[0]?.id ?? "";
  const activeArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === activeArtifactId) ?? null,
    [activeArtifactId, artifacts],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const updateScrollEdges = useCallback(() => {
    const list = tabsListRef.current;
    if (!list) return;

    const maxScrollLeft = list.scrollWidth - list.clientWidth;
    setScrollEdges({
      left: list.scrollLeft > 1,
      right: list.scrollLeft < maxScrollLeft - 1,
    });
  }, []);

  useEffect(() => {
    updateScrollEdges();

    const list = tabsListRef.current;
    if (!list) return;

    list.addEventListener("scroll", updateScrollEdges, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(list);

    return () => {
      list.removeEventListener("scroll", updateScrollEdges);
      resizeObserver.disconnect();
    };
  }, [artifactIds, updateScrollEdges]);

  const handleCloseArtifact = useCallback(
    (artifactId: string) => {
      removeArtifact(sessionId, artifactId);
    },
    [removeArtifact, sessionId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const sourceIndex = artifacts.findIndex((artifact) => artifact.id === active.id);
      const targetIndex = artifacts.findIndex((artifact) => artifact.id === over.id);
      if (sourceIndex < 0 || targetIndex < 0) return;
      reorderArtifacts(sessionId, sourceIndex, targetIndex);
    },
    [artifacts, reorderArtifacts, sessionId],
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
        <PanelHeader dragRegion className="pl-2">
          <div className="relative min-w-0 flex-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={artifactIds} strategy={horizontalListSortingStrategy}>
                <TabsList
                  ref={tabsListRef}
                  variant="line"
                  className="h-9 w-full min-w-0 justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {artifacts.map((artifact) => (
                    <ArtifactTab
                      key={artifact.id}
                      artifact={artifact}
                      onClose={handleCloseArtifact}
                    />
                  ))}
                </TabsList>
              </SortableContext>
            </DndContext>
            {scrollEdges.left ? (
              <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" />
            ) : null}
            {scrollEdges.right ? (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
            ) : null}
          </div>
        </PanelHeader>

        {activeArtifact ? (
          <TabsContent value={activeArtifact.id} className="min-h-0 overflow-hidden">
            <ArtifactContent artifact={activeArtifact} />
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
}

function ArtifactTab({ artifact, onClose }: ArtifactTabProps) {
  const Icon = getArtifactIcon(artifact.type);
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: artifact.id,
  });
  const horizontalTransform = transform ? `translate3d(${transform.x}px, 0, 0)` : undefined;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "app-no-drag group/tab relative flex max-w-48 shrink-0 touch-pan-x items-center",
        isDragging && "z-10 opacity-80",
      )}
      style={{
        transform: horizontalTransform,
        transition,
      }}
    >
      <TabsTrigger
        value={artifact.id}
        className="app-no-drag min-w-0 max-w-48 cursor-grab justify-start gap-1.5 rounded-lg !border-0 p-2 text-xs !shadow-none after:!hidden data-active:!border-0 data-active:!bg-[#F4F4F4] data-active:!shadow-none focus-visible:!border-0 hover:!bg-[#F4F4F4] active:cursor-grabbing dark:data-active:!border-0 dark:data-active:!bg-muted dark:hover:!bg-muted"
        {...attributes}
        {...listeners}
      >
        <span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground/80 transition-opacity group-hover/tab:opacity-0">
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
        <span className="truncate">{artifact.name}</span>
      </TabsTrigger>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="app-no-drag absolute left-1 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
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

function ArtifactContent({ artifact }: { artifact: ArtifactRecord }) {
  if (artifact.type === "side-chat") {
    return <SideChatArtifact artifact={artifact as SideChatArtifactRecord} />;
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
  if (normalizedType.includes("code")) return FileCode2;
  if (normalizedType.includes("html") || normalizedType.includes("json")) return Braces;
  if (normalizedType.includes("table") || normalizedType.includes("csv")) return TableProperties;
  if (normalizedType.includes("image")) return Image;
  if (normalizedType.includes("doc") || normalizedType.includes("text")) return FileText;
  if (normalizedType.includes("example")) return PackageOpen;
  if (normalizedType.includes("plugin") || normalizedType.includes("extension")) return Blocks;

  return Sparkles;
}

export function ArtifactPreview({ artifact }: { artifact: ArtifactRecord }) {
  const registry = useExtensionRegistry();
  const registration = registry.getArtifact(artifact.type);

  if (!registration) {
    return (
      <div className="p-3">
        <UnknownArtifact raw={JSON.stringify(artifact.content, null, 2)} type={artifact.type} />
      </div>
    );
  }

  const Renderer = registration.render;
  return (
    <div className="h-full min-h-full">
      <Renderer artifactId={artifact.id} content={artifact.content} />
    </div>
  );
}

function ArtifactEmptyState() {
  return (
    <div className="grid h-full min-h-80 place-items-center">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg border border-dashed border-border bg-muted/40">
          <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div className="text-sm font-medium text-foreground">No artifact selected</div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Select an artifact tab to view its content.
        </p>
      </div>
    </div>
  );
}
