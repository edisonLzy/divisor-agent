import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import type { ReactNode } from "react";

interface GroupSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function GroupSection({ title, defaultOpen = true, children }: GroupSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="mt-2 mb-2">
      <CollapsibleTrigger className="cursor-pointer flex w-full items-center px-4 py-1 text-[12px] font-medium text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/70">
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-[1px] px-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
