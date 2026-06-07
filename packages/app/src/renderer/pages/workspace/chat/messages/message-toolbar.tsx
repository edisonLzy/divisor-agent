import {
  MessageActions,
  MessageToolbar as BaseMessageToolbar,
} from "@renderer/components/ai-elements/message";
import { Button } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { cn } from "@renderer/lib/utils";
import { ChevronDownIcon, WandSparklesIcon } from "lucide-react";
import type { ReactNode } from "react";

interface MessageToolbarProps {
  align: "start" | "end";
  children: ReactNode;
}

export function MessageToolbar({ align, children }: MessageToolbarProps) {
  return (
    <BaseMessageToolbar
      className={cn(
        "mt-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      <MessageActions>{children}</MessageActions>
    </BaseMessageToolbar>
  );
}

interface MessageToolbarMenuButtonProps {
  align: "start" | "end";
  label?: string;
}

export function MessageToolbarMenuButton({
  align,
  label = "工具栏",
}: MessageToolbarMenuButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="gap-1.5 rounded-full border-border/70 bg-background/85 px-3 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/80 hover:text-foreground"
            size="sm"
            variant="outline"
          />
        }
      >
        <WandSparklesIcon className="size-3.5" />
        {label}
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-40 rounded-xl">
        <DropdownMenuItem disabled>更多操作即将开放</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
