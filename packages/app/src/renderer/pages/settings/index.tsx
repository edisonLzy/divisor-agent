import { useTheme, type Theme } from "@renderer/components/theme-provider";
import { Titlebar } from "@renderer/components/titlebar";
import { Input } from "@renderer/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@renderer/components/ui/resizable";
import { Switch } from "@renderer/components/ui/switch";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useAgentSkills } from "@renderer/hooks/use-agent-skills";
import { cn } from "@renderer/lib/utils";
import type { SkillScope } from "@shared/skills-ipc";
import Fuse from "fuse.js";
import {
  ArrowLeft,
  BoxIcon,
  Monitor,
  type LucideIcon,
  Moon,
  Paintbrush,
  SearchIcon,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
}> = [
  { id: "appearance", label: "外观", icon: Paintbrush },
  { id: "plugin", label: "Skills", icon: BoxIcon },
];

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

const SKILL_SCOPE_LABEL: Record<SkillScope, string> = {
  system: "系统",
  project: "项目",
  user: "个人",
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
  const { invoke } = useElectronIPC();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [skillsQuery, setSkillsQuery] = useState("");
  const skills = useAgentSkills();
  const [skillEnabledOverrides, setSkillEnabledOverrides] = useState<Record<string, boolean>>({});
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

  const resolvedSkills = useMemo(() => {
    return skills.map((skill) => ({
      ...skill,
      enabled: skillEnabledOverrides[skill.id] ?? skill.enabled,
    }));
  }, [skillEnabledOverrides, skills]);

  const filteredSkills = useMemo(() => {
    const query = skillsQuery.trim();
    if (!query) {
      return resolvedSkills;
    }

    return new Fuse(resolvedSkills, {
      threshold: 0.35,
      ignoreLocation: true,
      keys: ["name", "description", "filePath"],
    })
      .search(query)
      .map((result) => result.item);
  }, [resolvedSkills, skillsQuery]);

  const enabledSkillCount = useMemo(() => {
    return resolvedSkills.filter((skill) => skill.enabled).length;
  }, [resolvedSkills]);

  const handleSkillEnabledChange = async (skillId: string, enabled: boolean) => {
    const currentSkill = resolvedSkills.find((skill) => skill.id === skillId);
    if (!currentSkill) {
      return;
    }

    setSkillEnabledOverrides((currentOverrides) => ({
      ...currentOverrides,
      [skillId]: enabled,
    }));

    try {
      await invoke("setSkillEnabled", skillId, enabled);
    } catch (error) {
      console.error("Failed to update skill", error);
      setSkillEnabledOverrides((currentOverrides) => ({
        ...currentOverrides,
        [skillId]: currentSkill.enabled,
      }));
    }
  };

  useEffect(() => {
    setSkillEnabledOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      let hasChanges = false;

      for (const skill of skills) {
        if (nextOverrides[skill.id] === skill.enabled) {
          delete nextOverrides[skill.id];
          hasChanges = true;
        }
      }

      return hasChanges ? nextOverrides : currentOverrides;
    });
  }, [skills]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-transparent text-foreground">
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
          <aside className="flex h-full flex-col border-r border-sidebar-border/70 bg-sidebar/78 px-3 py-4 text-foreground select-none pt-9 supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
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

        <ResizableHandle />

        <ResizablePanel defaultSize="80%" minSize="60%">
          <div className="h-full w-full bg-sidebar/78 supports-backdrop-filter:bg-sidebar/68 supports-backdrop-filter:backdrop-blur-xl">
            <main
              className="-ml-px h-full overflow-y-auto rounded-l-[20px] border border-border/70 border-l-0 supports-backdrop-filter:backdrop-blur-xl"
              style={
                {
                  background:
                    "radial-gradient(circle at 10% 0%, var(--workspace-glow), transparent 40%), var(--workspace-surface)",
                } as React.CSSProperties
              }
            >
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
                {activeSection === "plugin" && (
                  <div className="min-h-0 space-y-4">
                    <div className="flex max-h-[min(680px,calc(100vh-9rem))] flex-col overflow-hidden rounded-lg border border-border bg-card">
                      <div className="shrink-0 flex flex-col gap-4 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-[13px] font-medium text-foreground">
                            Skills Discovery
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            已发现 {skills.length} 个技能，当前启用 {enabledSkillCount}{" "}
                            个。禁用后不会出现在 prompt 和 `/` 建议中。
                          </div>
                        </div>
                        <div className="relative w-full md:w-64">
                          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={skillsQuery}
                            onChange={(event) => setSkillsQuery(event.target.value)}
                            placeholder="搜索技能"
                            className="h-8 pl-8 text-[12px]"
                          />
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
                        {filteredSkills.length === 0 ? (
                          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                            没有匹配的技能
                          </div>
                        ) : (
                          filteredSkills.map((skill) => (
                            <div
                              key={skill.id}
                              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/35"
                            >
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                                <BoxIcon className="size-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="truncate text-[13px] font-medium text-foreground">
                                    {skill.name}
                                  </div>
                                  <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {SKILL_SCOPE_LABEL[skill.scope]}
                                  </span>
                                </div>
                                <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                                  {skill.description}
                                </div>
                                <div className="mt-1 truncate text-[11px] text-muted-foreground/70">
                                  {skill.filePath}
                                </div>
                              </div>
                              <Switch
                                checked={skill.enabled}
                                onCheckedChange={(enabled) => {
                                  void handleSkillEnabledChange(skill.id, enabled);
                                }}
                                aria-label={`Toggle ${skill.name}`}
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
