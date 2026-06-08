import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { Maximize2, PanelRightClose } from "lucide-react";

interface ArtifactsProps {
  className?: string;
  onClose: () => void;
}

export function Artifacts({ className, onClose }: ArtifactsProps) {
  return (
    <aside
      className={cn(
        "flex h-full min-w-90 flex-col border-l border-border/70 bg-background/80 supports-backdrop-filter:backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-500" />
          <div className="truncate text-sm font-medium text-foreground">Artifact</div>
          <div className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Preview
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Expand artifact">
            <Maximize2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close artifact"
            onClick={onClose}
          >
            <PanelRightClose className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-muted/40 px-2">
            <span className="size-2.5 rounded-full bg-red-400/80" />
            <span className="size-2.5 rounded-full bg-yellow-400/80" />
            <span className="size-2.5 rounded-full bg-green-400/80" />
            <span className="ml-2 truncate text-xs text-muted-foreground">
              artifact preview surface
            </span>
          </div>

          <div className="grid min-h-0 flex-1 place-items-center bg-background">
            <div className="w-full max-w-sm px-6 text-center">
              <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg border border-dashed border-border bg-muted/40">
                <Maximize2 className="size-4 text-muted-foreground" />
              </div>
              <div className="text-sm font-medium text-foreground">Artifact layout placeholder</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                The host panel is ready for generated files, previews, and interactive artifacts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
