import { useTheme, type Theme } from "@renderer/components/theme-provider";
import { buttonVariants } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { cn } from "@renderer/lib/utils";
import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useMemo } from "react";

const THEME_OPTIONS = [
  { value: "light", label: "明亮", icon: SunIcon },
  { value: "dark", label: "暗色", icon: MoonIcon },
  { value: "system", label: "跟随系统", icon: MonitorIcon },
] as const satisfies ReadonlyArray<{
  value: Theme;
  label: string;
  icon: typeof SunIcon;
}>;

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  const activeTheme = useMemo(() => {
    return THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  }, [theme]);

  const ActiveIcon = activeTheme.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-2 bg-card px-3 text-card-foreground",
        )}
        aria-label="切换主题"
      >
        <ActiveIcon className="size-4" />
        <span>{activeTheme.label}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-40 rounded-md border-2 border-border shadow-[var(--hard-shadow)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>主题</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system") {
              setTheme(value);
            }
          }}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            return (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                className="gap-2.5 rounded-sm px-2 py-1.5"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span>{label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
