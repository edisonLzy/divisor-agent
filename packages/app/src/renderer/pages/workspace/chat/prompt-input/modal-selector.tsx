import { Input } from "@renderer/components/ui/input";
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
import type { AvailableModel } from "@shared/models-ipc";
import { CircleHelp, Cpu } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export function ModalSelector({ value, onChange }: ModalSelectorProps) {
  const { invoke } = useElectronIPC();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isActive = true;

    const loadModels = async () => {
      setIsLoading(true);

      try {
        const nextModels = await invoke("getAvailableModels");
        if (isActive) {
          setModels(nextModels);
        }
      } catch (error) {
        console.error("Failed to load available models", error);
        if (isActive) {
          setModels([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadModels();

    return () => {
      isActive = false;
    };
  }, [invoke]);

  useEffect(() => {
    if (value === null && models.length > 0) {
      onChange(models[0]);
    }
  }, [models, onChange, value]);

  const selectedValue = value ? `${value.providerId}/${value.modelId}` : null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!normalizedQuery) {
      return models;
    }

    return models.filter((model) => {
      return [model.modelName, model.providerName, model.providerId, model.modelId].some((field) =>
        field?.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [models, normalizedQuery]);

  return (
    <Select
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
      value={selectedValue}
      onValueChange={(nextValue) => {
        const nextModel =
          models.find((model) => `${model.providerId}/${model.modelId}` === nextValue) ?? null;
        onChange(nextModel);
      }}
      disabled={isLoading || models.length === 0}
    >
      <SelectTrigger
        className="h-7 w-auto max-w-50 gap-1 rounded-sm border-none bg-transparent px-2 text-foreground shadow-none hover:bg-muted data-popup-open:bg-muted focus:ring-0"
        aria-label="Select model"
      >
        <SelectValue className="pointer-events-none min-w-0">
          {value ? (
            <div className="flex min-w-0 items-center gap-1.5 text-left text-xs font-normal text-muted-foreground">
              <span className="block truncate">{value.modelName ?? value.modelId}</span>
            </div>
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {isLoading ? "加载中..." : "选择模型"}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>

      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        sideOffset={8}
        className="w-max min-w-56 max-w-80 max-h-none overflow-hidden rounded-2xl border border-border/80 bg-popover/96 p-0 text-popover-foreground shadow-[0_18px_48px_rgb(15_23_42/0.16)] backdrop-blur-xl dark:shadow-[0_18px_48px_rgb(0_0_0/0.4)]"
      >
        <div className="border-b border-border/70 px-2 py-2.5">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDownCapture={(event) => {
              event.stopPropagation();
            }}
            placeholder="搜索模型..."
            className="h-8 rounded-xl border-border/70 bg-background/70 px-3 text-[12px] text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-60 overflow-x-hidden overflow-y-auto px-1 py-1.5">
          <TooltipProvider delay={120}>
            <SelectGroup className="min-w-0 p-0">
              {filteredModels.map((model) => {
                const modelValue = `${model.providerId}/${model.modelId}`;
                const isSelected = selectedValue === modelValue;

                return (
                  <SelectItem
                    key={modelValue}
                    value={modelValue}
                    className={cn(
                      "mb-0.5 last:mb-0 w-full overflow-hidden rounded-lg border border-transparent px-3 py-2 text-foreground focus:bg-transparent focus:text-foreground",
                      isSelected && "text-foreground",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden pr-6">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-lg bg-background/80 text-muted-foreground">
                        <Cpu className="size-3" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <span className="block min-w-0 truncate text-[13px] font-medium leading-none text-current">
                          {model.modelName ?? model.modelId}
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
                          <TooltipContent side="top" className="text-[11px]">
                            {model.providerName ?? model.providerId}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </TooltipProvider>

          {!isLoading && filteredModels.length === 0 ? (
            <div
              className={cn(
                "px-3 py-3 text-[12px] text-muted-foreground",
                models.length === 0 && "text-center",
              )}
            >
              {models.length === 0 ? "没有可用模型" : "没有匹配的模型"}
            </div>
          ) : null}
        </div>
      </SelectContent>
    </Select>
  );
}

interface ModalSelectorProps {
  value: AvailableModel | null;
  onChange: (value: AvailableModel | null) => void;
}

export function useModalSelector(initialValue: AvailableModel | null = null): ModalSelectorProps {
  const [value, setValue] = useState<AvailableModel | null>(initialValue);

  const handleChange = useCallback((nextValue: AvailableModel | null) => {
    setValue(nextValue);
  }, []);

  return useMemo(() => ({ value, onChange: handleChange }), [handleChange, value]);
}
