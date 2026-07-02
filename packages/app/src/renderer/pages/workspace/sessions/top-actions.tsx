import { SquarePen } from "lucide-react";

import { useCreateSession } from "../use-create-session";
import { useWindowFullScreen } from "../use-window-full-screen";

export function TopActions() {
  const isWindowFullScreen = useWindowFullScreen();

  return (
    <header
      className="app-drag-region flex h-12 shrink-0 items-center border-b-2 border-sidebar-border px-2"
      style={
        isWindowFullScreen
          ? undefined
          : { paddingLeft: "calc(var(--window-controls-left) + 0.5rem)" }
      }
    >
      <CreateSessionButton />
    </header>
  );
}

function CreateSessionButton() {
  const { handleCreateSession } = useCreateSession();

  return (
    <button
      onClick={() => handleCreateSession()}
      className="flex h-8 w-full items-center gap-2 overflow-hidden rounded-md border-2 border-sidebar-border bg-sidebar-primary px-3 text-[13px] font-bold text-sidebar-primary-foreground shadow-[var(--hard-shadow-sm)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
    >
      <SquarePen className="size-4 shrink-0" />
      <span className="truncate">新对话</span>
    </button>
  );
}
