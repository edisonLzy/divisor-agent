import { SquarePen } from "lucide-react";

export function TopActions() {
  return (
    <div className="flex flex-col p-2 pb-0">
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
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground overflow-hidden"
    >
      <SquarePen className="size-4 opacity-70 shrink-0" />
      <span className="truncate">新对话</span>
    </button>
  );
}
