import { SquarePen } from "lucide-react";

import { useCreateSession } from "../use-create-session";

export function TopActions() {
  return (
    <div className="shrink-0 border-b border-sidebar-border/25 p-3">
      <CreateSessionButton />
    </div>
  );
}

function CreateSessionButton() {
  const { handleCreateSession } = useCreateSession();

  return (
    <button
      onClick={() => handleCreateSession()}
      className="flex w-full items-center gap-2 overflow-hidden rounded-md border-2 border-sidebar-border bg-sidebar-primary px-3 py-2 text-[13px] font-bold text-sidebar-primary-foreground shadow-[var(--hard-shadow-sm)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
    >
      <SquarePen className="size-4 shrink-0" />
      <span className="truncate">新对话</span>
    </button>
  );
}
