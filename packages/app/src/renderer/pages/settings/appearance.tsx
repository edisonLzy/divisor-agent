import { useTheme, type Theme } from "@renderer/components/theme-provider";
import { cn } from "@renderer/lib/utils";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { SettingsSectionContainer, StatusCard } from "./layout";

type PreviewTone = "default" | "selected" | "resolved";

interface PreviewLine {
  line: number;
  content: string;
  tone?: PreviewTone;
}

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

export function SettingsAppearancePage() {
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
    <SettingsSectionContainer title="外观">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
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
              description={theme === "system" ? "由系统外观实时决定" : "已固定为当前外观模式"}
            />
            <StatusCard
              label="偏好保存"
              value="已持久化"
              description="主题偏好会保存在当前设备的本地存储中"
            />
          </div>

          <div className="border-b border-border bg-muted/25 p-4">
            <div className="flex overflow-hidden rounded border border-border bg-background text-[11px] font-mono leading-relaxed max-md:flex-col">
              <div className="border-r border-border max-md:border-r-0 max-md:border-b md:flex-1">
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
    </SettingsSectionContainer>
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
              line.tone === "selected" && "border-sky-500/70 bg-sky-500/10",
              line.tone === "resolved" && "border-emerald-500/70 bg-emerald-500/10",
            )}
          >
            <div
              className={cn(
                "mr-3 w-4 shrink-0 text-right text-muted-foreground",
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
