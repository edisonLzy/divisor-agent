import { cn } from "@renderer/lib/utils";
import type { ReactNode } from "react";

interface FixedActionsProps {
  children: ReactNode;
  className?: string;
}

/**
 * Layout-only container that anchors its children to the top-left corner
 * of the nearest positioned ancestor. Use it to host overlay action buttons
 * that should float above the main chat content (e.g. toggling the artifact
 * panel).
 */
export function FixedActions({ children, className }: FixedActionsProps) {
  return (
    <div className={cn("absolute left-3 top-3 z-10 flex items-center gap-2", className)}>
      {children}
    </div>
  );
}
