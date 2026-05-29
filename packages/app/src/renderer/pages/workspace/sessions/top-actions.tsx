import { SquarePen } from "lucide-react";

import { useCreateSession } from "../use-create-session";

export function TopActions() {
  return (
    <div className="shrink-0 p-2">
      <CreateSessionButton />
    </div>
  );
}

function CreateSessionButton() {
  const { handleCreateSession } = useCreateSession();

  return (
    <button
      onClick={() => handleCreateSession()}
      className="flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-sidebar-primary transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <SquarePen className="size-4 shrink-0 text-sidebar-foreground/55" />
      <span className="truncate">新对话</span>
    </button>
  );
}
