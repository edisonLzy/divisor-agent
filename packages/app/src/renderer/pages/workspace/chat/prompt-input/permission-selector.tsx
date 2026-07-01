import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import { mainStore } from "@renderer/store/main";
import type { PermissionMode } from "@shared/permissions-ipc";
import { CircleHelp, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

const PERMISSION_OPTIONS: Array<{
  value: PermissionMode;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    value: "default",
    label: "默认权限",
    description: "高风险操作前确认",
    icon: ShieldAlert,
  },
  {
    value: "bypasspermission",
    label: "完全访问权限",
    description: "直接执行高风险操作",
    icon: ShieldCheck,
  },
];

interface PermissionSelectorProps {
  disabled?: boolean;
  onChange: (mode: PermissionMode) => Promise<void> | void;
  value: PermissionMode;
}

export function PermissionSelector({ disabled = false, onChange, value }: PermissionSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedOption =
    PERMISSION_OPTIONS.find((option) => option.value === value) ?? PERMISSION_OPTIONS[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(nextValue) => {
        void onChange(nextValue as PermissionMode);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-7 w-auto max-w-44 gap-1 rounded-sm border-2 border-border bg-card px-2 text-foreground shadow-[var(--hard-shadow-sm)] hover:bg-accent data-popup-open:bg-accent focus:ring-0"
        aria-label="Select permission mode"
      >
        <SelectValue className="pointer-events-none min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-left text-xs font-normal text-muted-foreground">
            <SelectedIcon className="size-3.5 shrink-0" />
            <span className="block truncate">{selectedOption.label}</span>
          </div>
        </SelectValue>
      </SelectTrigger>

      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        sideOffset={8}
        className="max-h-none w-max min-w-42 max-w-64 overflow-hidden rounded-md border-2 border-border bg-popover p-0 text-popover-foreground shadow-[var(--hard-shadow)]"
      >
        <TooltipProvider delay={120}>
          <SelectGroup className="min-w-0 p-0">
            {PERMISSION_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              const isSelected = option.value === value;

              return (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "mb-0.5 last:mb-0 w-full overflow-hidden rounded-sm border border-transparent px-3 py-2 text-foreground focus:bg-accent focus:text-accent-foreground",
                    isSelected && "text-foreground",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden pr-6">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border bg-signal-green text-accent-foreground">
                      <OptionIcon className="size-3" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium leading-none text-current">
                        {option.label}
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/75 transition-colors hover:text-foreground"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            />
                          }
                        >
                          <CircleHelp className="size-3.25" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-52 text-[11px]">
                          {option.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </TooltipProvider>
      </SelectContent>
    </Select>
  );
}

export function usePermissionSelector(sessionId: string | null): PermissionSelectorProps {
  const { invoke } = useElectronIPC();
  const value = useStore(mainStore, (state) => {
    if (!sessionId) {
      return "default";
    }

    return state.getPermissionState(sessionId).mode;
  });

  const handleChange = useCallback(
    async (mode: PermissionMode) => {
      if (!sessionId) {
        return;
      }

      const store = mainStore.getState();
      const previousMode = store.getPermissionState(sessionId).mode;
      if (previousMode === mode) {
        return;
      }

      store.setPermissionMode(sessionId, mode);

      try {
        await invoke("setPermissionMode", sessionId, mode);
      } catch (error) {
        store.setPermissionMode(sessionId, previousMode);
        toast.error(error instanceof Error ? error.message : "切换权限模式失败");
      }
    },
    [invoke, sessionId],
  );

  return useMemo(
    () => ({
      value,
      onChange: handleChange,
      disabled: sessionId === null,
    }),
    [handleChange, sessionId, value],
  );
}
