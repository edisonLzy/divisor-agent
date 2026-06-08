import {
  MessageActions,
  MessageToolbar as BaseMessageToolbar,
} from "@renderer/components/ai-elements/message";
import { cn } from "@renderer/lib/utils";
import type { ReactNode } from "react";

interface MessageToolbarProps {
  align: "start" | "end";
  children: ReactNode;
}

export function MessageToolbar({ align, children }: MessageToolbarProps) {
  return (
    <BaseMessageToolbar className={cn("mt-0", align === "end" ? "justify-end" : "justify-start")}>
      <MessageActions>{children}</MessageActions>
    </BaseMessageToolbar>
  );
}
