import { Titlebar } from "@renderer/components/titlebar";
import { Button } from "@renderer/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { cn } from "@renderer/lib/utils";
import { ArrowLeft, Bot, BoxIcon, Paintbrush, Settings } from "lucide-react";
import { type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

type SettingsSection = "appearance" | "models" | "skills";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  path: string;
  icon: typeof Settings;
}> = [
  { id: "appearance", label: "外观", path: "/settings/appearance", icon: Paintbrush },
  { id: "models", label: "Models", path: "/settings/models", icon: Bot },
  { id: "skills", label: "Skills", path: "/settings/skills", icon: BoxIcon },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSectionLabel =
    SECTIONS.find((section) => location.pathname.startsWith(section.path))?.label ?? "设置";

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize="20%" minSize="16%" maxSize="24%">
          <div className="flex h-full min-w-0 flex-col bg-sidebar">
            <Titlebar windowControls="left" className="bg-sidebar text-sidebar-foreground">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
              >
                <ArrowLeft data-icon="inline-start" />
                返回应用
              </Button>
            </Titlebar>
            <aside className="min-h-0 flex-1 overflow-y-auto px-3 py-4 text-foreground select-none">
              <nav className="flex flex-col gap-1">
                {SECTIONS.map((section) => {
                  return (
                    <NavLink
                      key={section.id}
                      to={section.path}
                      className={({ isActive }) =>
                        cn(
                          "flex w-full items-center gap-2.5 rounded-md border-2 px-2 py-1.5 text-left text-[13px] transition-all",
                          isActive
                            ? "border-border bg-accent text-accent-foreground shadow-[var(--hard-shadow-sm)]"
                            : "border-transparent text-muted-foreground hover:border-border/30 hover:bg-sidebar-accent hover:text-foreground",
                        )
                      }
                    >
                      <section.icon className="size-3.5 opacity-80" />
                      <span>{section.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </aside>
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-0.5 bg-border" />

        <ResizablePanel defaultSize="80%" minSize="60%">
          <div className="flex h-full w-full flex-col bg-background">
            <Titlebar windowControls="right" className="bg-background pl-4 text-foreground">
              <h1 className="truncate text-sm font-bold tracking-tight">{activeSectionLabel}</h1>
            </Titlebar>
            <main
              className="min-h-0 flex-1 overflow-y-auto bg-[var(--workspace-surface)]"
              style={
                {
                  background:
                    "radial-gradient(circle at 10% 0%, var(--workspace-glow), transparent 40%), var(--workspace-surface)",
                } as CSSProperties
              }
            >
              <Outlet />
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
