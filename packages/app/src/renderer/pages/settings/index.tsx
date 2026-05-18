import { useTheme, type Theme } from "@renderer/components/theme-provider";
import { Titlebar } from "@renderer/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { cn } from "@renderer/lib/utils";
import { ArrowLeft, Monitor, type LucideIcon, Moon, Paintbrush, Settings, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type SettingsSection =
  | "general"
  | "appearance"
  | "config"
  | "personalization"
  | "mcp"
  | "git"
  | "env"
  | "workspace"
  | "browser"
  | "plugin"
  | "history";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof Settings;
}> = [{ id: "appearance", label: "外观", icon: Paintbrush }];

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "light", label: "浅色", description: "保持明亮界面", icon: Sun },
  { value: "dark", label: "深色", description: "适合低照度环境", icon: Moon },
  { value: "system", label: "系统", description: "自动匹配系统设置", icon: Monitor },
];

const RESOLVED_THEME_LABEL: Record<Exclude<Theme, "system">, string> = {
  light: "浅色",
  dark: "深色",
};

type PreviewTone = "default" | "selected" | "resolved";

interface PreviewLine {
  line: number;
  content: string;
  tone?: PreviewTone;
}

function StatusCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[15px] font-medium text-foreground">{value}</div>
      <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

function CodePreviewPane({
  title,
  description,
  lines,
}: {
  title: string;
  description: string;
  lines: PreviewLine[];
}) {
  return (
    <div className="flex-1 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</div>
        </div>
      </div>

      {lines.map((line) => {
        return (
          <div
            key={`${title}-${line.line}`}
            className={cn(
              "flex border-l-2 border-transparent text-[11px] leading-relaxed",
              line.tone === "selected" && "bg-sky-500/10 border-sky-500/70",
              line.tone === "resolved" && "bg-emerald-500/10 border-emerald-500/70",
            )}
          >
            <div
              className={cn(
                "w-4 shrink-0 text-right mr-3 text-muted-foreground",
                line.tone === "selected" && "text-sky-600 dark:text-sky-300",
                line.tone === "resolved" && "text-emerald-600 dark:text-emerald-300",
              )}
            >
              {line.line}
            </div>
            <div
              className={cn(
                "min-w-0 whitespace-pre-wrap text-foreground/80",
                line.tone === "selected" && "text-sky-700 dark:text-sky-200",
                line.tone === "resolved" && "text-emerald-700 dark:text-emerald-200",
              )}
            >
              {line.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const { resolvedTheme, setTheme, theme } = useTheme();

  const selectedTheme = useMemo(() => {
    return THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  }, [theme]);

  const effectiveThemeLabel = RESOLVED_THEME_LABEL[resolvedTheme];
  const preferenceLines: PreviewLine[] = [
    { line: 1, content: "const preference = {" },
    { line: 2, content: `  theme: "${theme}",`, tone: "selected" },
    { line: 3, content: `  label: "${selectedTheme.label}",`, tone: "selected" },
    { line: 4, content: '  storage: "localStorage",' },
    { line: 5, content: "};" },
  ];
  const runtimeLines: PreviewLine[] = [
    { line: 1, content: "const runtime = {" },
    { line: 2, content: `  effective: "${resolvedTheme}",`, tone: "resolved" },
    { line: 3, content: `  colorScheme: "${resolvedTheme}",`, tone: "resolved" },
    { line: 4, content: '  root: "html[data-theme]",' },
    { line: 5, content: "};" },
  ];

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <Titlebar>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <ArrowLeft className="size-3.5" />
          返回应用
        </button>
      </Titlebar>
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="20%" minSize="16%" maxSize="24%">
          <aside className="flex h-full flex-col border-r border-border bg-card px-3 py-4 text-foreground select-none">
            <nav className="flex flex-col space-y-0.5">
              {SECTIONS.map((section) => {
                const isActive = section.id === activeSection;

                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <section.icon className="size-3.5 opacity-80" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="80%" minSize="60%">
          <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto flex min-h-full w-full max-w-160 flex-col px-10 py-12">
              <h1 className="mb-8 text-center text-[20px] font-medium text-foreground">
                {SECTIONS.find((section) => section.id === activeSection)?.label}
              </h1>
              {activeSection === "appearance" && (
                <div className="space-y-6">
                  {/* Theme Settings Panel */}
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    {/* Theme Header */}
                    <div className="flex flex-col gap-4 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-[13px] font-medium text-foreground">主题</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          使用浅色、深色，或匹配系统设置
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-1">
                        {THEME_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const isActive = option.value === theme;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={isActive}
                              onClick={() => setTheme(option.value)}
                              className={cn(
                                "flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] transition-colors",
                                isActive
                                  ? "bg-accent text-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              <Icon className="size-3" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-3 border-b border-border bg-background/30 px-4 py-4 md:grid-cols-3">
                      <StatusCard
                        label="当前选择"
                        value={selectedTheme.label}
                        description={selectedTheme.description}
                      />
                      <StatusCard
                        label="实际生效"
                        value={effectiveThemeLabel}
                        description={
                          theme === "system" ? "由系统外观实时决定" : "已固定为当前外观模式"
                        }
                      />
                      <StatusCard
                        label="偏好保存"
                        value="已持久化"
                        description="主题偏好会保存在当前设备的本地存储中"
                      />
                    </div>

                    {/* Theme Preview */}
                    <div className="border-b border-border bg-muted/25 p-4">
                      <div className="flex overflow-hidden rounded border border-border bg-background text-[11px] font-mono leading-relaxed max-md:flex-col">
                        <div className="border-r border-border max-md:border-b max-md:border-r-0 md:flex-1">
                          <CodePreviewPane
                            title="Preference"
                            description="展示当前保存的主题偏好。"
                            lines={preferenceLines}
                          />
                        </div>
                        <div className="md:flex-1">
                          <CodePreviewPane
                            title="Runtime"
                            description="展示当前页面实际使用的外观结果。"
                            lines={runtimeLines}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
