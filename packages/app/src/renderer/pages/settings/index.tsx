import { Titlebar } from "@renderer/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { cn } from "@renderer/lib/utils";
import { ArrowLeft, Bot, BoxIcon, Paintbrush, Settings, Wrench } from "lucide-react";
import { type CSSProperties } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

type SettingsSection = "appearance" | "models" | "skills" | "engineering";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  path: string;
  icon: typeof Settings;
}> = [
  { id: "appearance", label: "外观", path: "/settings/appearance", icon: Paintbrush },
  { id: "models", label: "Models", path: "/settings/models", icon: Bot },
  { id: "skills", label: "Skills", path: "/settings/skills", icon: BoxIcon },
  { id: "engineering", label: "Engineering", path: "/settings/engineering", icon: Wrench },
];

export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-transparent text-foreground">
      <Titlebar>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <ArrowLeft className="size-3.5" />
          返回应用
        </button>
      </Titlebar>
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="20%" minSize="16%" maxSize="24%">
          <aside className="flex h-full flex-col border-r border-sidebar-border/70 bg-sidebar/78 px-3 py-4 pt-9 text-foreground select-none supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
            <nav className="flex flex-col space-y-0.5">
              {SECTIONS.map((section) => {
                return (
                  <NavLink
                    key={section.id}
                    to={section.path}
                    className={({ isActive }) =>
                      cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize="80%" minSize="60%">
          <div className="h-full w-full bg-sidebar/78 supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
            <main
              className="-ml-px h-full overflow-y-auto rounded-l-[20px] border border-border/70 border-l-0 supports-backdrop-filter:backdrop-blur-xl"
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
