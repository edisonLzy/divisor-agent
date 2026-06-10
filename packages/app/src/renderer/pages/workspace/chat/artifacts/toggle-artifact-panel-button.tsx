import { Button } from "@renderer/components/ui/button";
import { mainStore } from "@renderer/store/main";
import { PanelRightOpen } from "lucide-react";
import { useStore } from "zustand";

interface ToggleArtifactPanelButtonProps {
  sessionId: string;
}

/**
 * Floating button that opens the artifacts panel for the given session.
 * Renders nothing when there are no artifacts yet, or when the panel is
 * already open — keeping the chat surface uncluttered.
 */
export function ToggleArtifactPanelButton({ sessionId }: ToggleArtifactPanelButtonProps) {
  const artifactState = useStore(mainStore, (state) => state.getArtifactState(sessionId));
  const setArtifactPanelOpen = useStore(mainStore, (state) => state.setArtifactPanelOpen);

  const hasArtifacts = artifactState.artifacts.length > 0;
  const isOpen = artifactState.isOpen;

  if (!hasArtifacts || isOpen) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      className="rounded-lg border border-border/70 bg-background/90 shadow-sm supports-backdrop-filter:backdrop-blur-xl"
      onClick={() => setArtifactPanelOpen(sessionId, true)}
      aria-label="Open artifacts panel"
    >
      <PanelRightOpen />
    </Button>
  );
}
