import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { sessionStore } from "@renderer/store";
import type { PermissionMode } from "@shared/permissions-ipc";
import { ShieldAlert, ShieldCheck } from "lucide-react";
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
    label: "default",
    description: "高风险操作执行前需要确认",
    icon: ShieldAlert,
  },
  {
    value: "bypasspermission",
    label: "bypasspermission",
    description: "高风险操作直接执行，不再请求确认",
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
        className="h-7 w-auto max-w-44 gap-1 rounded-sm border-none bg-transparent px-2 text-foreground shadow-none hover:bg-muted data-popup-open:bg-muted focus:ring-0"
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
        sideOffset={10}
        className="w-80 min-w-80 max-h-none overflow-hidden rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-[0_20px_48px_rgb(15_23_42/0.16)] dark:shadow-[0_20px_48px_rgb(0_0_0/0.4)]"
      >
        <div className="border-b border-border px-3 py-2.5">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Session Permissions
          </div>
        </div>

        <div className="px-2 py-2">
          <SelectGroup className="min-w-0 p-0">
            {PERMISSION_OPTIONS.map((option) => {
              const OptionIcon = option.icon;

              return (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="w-full overflow-hidden rounded-xl px-3 py-2 text-foreground focus:bg-accent focus:text-accent-foreground"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden pr-3">
                    <OptionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="block truncate text-sm font-medium text-current">
                        {option.label}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectGroup>
        </div>
      </SelectContent>
    </Select>
  );
}

export function usePermissionSelector(sessionId: string | null): PermissionSelectorProps {
  const { invoke } = useElectronIPC();
  const value = useStore(sessionStore, (state) => {
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

      const store = sessionStore.getState();
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
