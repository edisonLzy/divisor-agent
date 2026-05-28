import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BottomActions() {
  return (
    <div className="shrink-0 p-3">
      <SettingsButton />
    </div>
  );
}

function SettingsButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/settings")}
      className="flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/75 transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Settings className="size-4 shrink-0 text-sidebar-foreground/55" />
      <span className="truncate">设置</span>
    </button>
  );
}
