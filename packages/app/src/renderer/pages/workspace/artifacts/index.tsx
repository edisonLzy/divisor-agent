import { useExtensionRegistry } from "@divisor-agent/extension-core/renderer";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { UnknownArtifact } from "@renderer/extensions/fallback-renderers";
import { cn } from "@renderer/lib/utils";
import type { ArtifactRecord } from "@renderer/store";
import { Maximize2, PanelRightClose, PuzzleIcon } from "lucide-react";

interface ArtifactsProps {
  activeArtifact?: ArtifactRecord;
  className?: string;
  onClose: () => void;
}

export function Artifacts({ activeArtifact, className, onClose }: ArtifactsProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-w-90 flex-col border-l border-border/70 bg-background/80 supports-backdrop-filter:backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-2 rounded-full bg-primary" />
          <div className="truncate text-sm font-medium text-foreground">Artifact</div>
          <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
            Preview
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Expand artifact">
            <Maximize2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close artifact"
            onClick={onClose}
          >
            <PanelRightClose />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-muted/40 px-2">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-muted-foreground/40" />
            <span className="size-2.5 rounded-full bg-primary/70" />
            <span className="ml-2 truncate text-xs text-muted-foreground">
              {activeArtifact?.type ?? "artifact preview surface"}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-background">
            {activeArtifact ? (
              <ArtifactPreview artifact={activeArtifact} />
            ) : (
              <ArtifactEmptyState />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ArtifactPreview({ artifact }: { artifact: ArtifactRecord }) {
  const registry = useExtensionRegistry();
  const registration = registry.getArtifact(artifact.type);

  if (!registration) {
    return (
      <div className="p-3">
        <UnknownArtifact raw={artifact.raw} type={artifact.type} />
      </div>
    );
  }

  const Renderer = registration.render;
  return (
    <div className="h-full min-h-full p-3">
      <Renderer artifactId={artifact.id} props={artifact.props} raw={artifact.raw} />
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
          Plugin artifacts will render here when an assistant response emits a divisor-artifact
          block.
        </p>
      </div>
    </div>
  );
}
