import { SquarePen } from "lucide-react";

export function TopActions() {
  return (
    <div className="flex flex-col px-2 py-4 space-y-0.5">
      <CreateSessionButton />
    </div>
  );
}

function CreateSessionButton() {
  const handleCreateSession = () => {
    // TODO: implement session creation
  };

  return (
    <button
      onClick={handleCreateSession}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground overflow-hidden"
    >
      <SquarePen className="size-4 opacity-70 shrink-0" />
      <span className="truncate">新对话</span>
    </button>
  );
}
