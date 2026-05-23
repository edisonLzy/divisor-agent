import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BottomActions() {
  return (
    <div className="flex flex-col px-3 py-3 border-t border-sidebar-border space-y-[2px]">
      <SettingsButton />
    </div>
  );
}

function SettingsButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/settings")}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground overflow-hidden"
    >
      <Settings className="size-4 opacity-70 shrink-0" />
      <span className="truncate">设置</span>
    </button>
  );
}
