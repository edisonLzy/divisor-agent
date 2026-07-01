import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function BottomActions() {
  return (
    <div className="shrink-0 border-t-2 border-sidebar-border bg-accent p-3">
      <SettingsButton />
    </div>
  );
}

function SettingsButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/settings")}
      className="flex w-full items-center gap-2 overflow-hidden rounded-md border-2 border-sidebar-border bg-card px-3 py-2 text-[13px] font-semibold text-sidebar-foreground shadow-[var(--hard-shadow-sm)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
    >
      <Settings className="size-4 shrink-0 text-sidebar-foreground/55" />
      <span className="truncate">设置</span>
    </button>
  );
}
