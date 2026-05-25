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
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="cursor-pointer flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground">
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-px py-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
