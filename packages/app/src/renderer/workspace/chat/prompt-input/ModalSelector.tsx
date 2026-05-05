import { Input } from "@renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type { AvailableModel } from "@shared/models-ipc";
import { Bot } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ModalSelectorProps {
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

  const selectedValue = value ? `${value.providerId}/${value.modelId}` : undefined;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!normalizedQuery) {
      return models;
    }

    return models.filter((model) => {
      return [model.modelName, model.providerName, model.providerId, model.modelId].some(
        (field) => {
          return field.toLowerCase().includes(normalizedQuery);
        },
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
        className="h-9 min-w-44 max-w-60 gap-2 rounded-full border-[#3A3A3A] bg-[#202020] px-3 text-[#E6E6E6] hover:border-[#505050] hover:bg-[#242424] data-popup-open:border-[#5C5C5C] data-popup-open:bg-[#262626] **:data-[slot=select-value]:items-center **:data-[slot=select-value]:line-clamp-none"
        aria-label="Select model"
      >
        <SelectValue className="min-w-0">
          {value ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2D2D2D] text-[#BDBDBD]">
                <Bot className="size-3.5" />
              </span>

              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[#E6E6E6]">
                  {value.modelName}
                </span>
                <span className="block truncate text-[11px] text-[#8D8D8D]">
                  {value.providerName}
                </span>
              </span>
            </div>
          ) : (
            <span className="truncate text-sm text-[#8D8D8D]">
              {isLoading ? "Loading models..." : "Select model"}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="end"
        sideOffset={10}
        className="w-80 min-w-80 max-h-none overflow-hidden rounded-2xl border border-[#333333] bg-[#1B1B1B] p-0 text-[#E6E6E6] shadow-[0_20px_48px_rgba(0,0,0,0.4)]"
      >
        <div className="border-b border-[#2B2B2B] px-3 py-2.5">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDownCapture={(event) => {
              event.stopPropagation();
            }}
            placeholder="Filter models..."
            className="h-8 border-[#343434] bg-[#232323] text-[#E6E6E6] placeholder:text-[#777777]"
          />
        </div>

        <div className="max-h-56 overflow-x-hidden overflow-y-auto px-2 py-2">
          <SelectGroup className="min-w-0 p-0">
            {filteredModels.map((model) => (
              <SelectItem
                key={`${model.providerId}/${model.modelId}`}
                value={`${model.providerId}/${model.modelId}`}
                className="w-full overflow-hidden rounded-xl px-3 py-2 text-[#D8D8D8] focus:bg-[#262626] focus:text-[#F3F3F3]"
              >
                <div className="min-w-0 flex flex-1 flex-col gap-0.5 overflow-hidden pr-3">
                  <span className="block min-w-0 truncate text-sm font-medium text-current">
                    {model.modelName}
                  </span>
                  <span className="block min-w-0 truncate text-xs text-[#8D8D8D]">
                    {model.providerName}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          {!isLoading && filteredModels.length === 0 ? (
            <div
              className={cn(
                "px-3 py-3 text-sm text-[#7D7D7D]",
                models.length === 0 && "text-center",
              )}
            >
              {models.length === 0 ? "No models found." : "No models match your filter."}
            </div>
          ) : null}
        </div>
      </SelectContent>
    </Select>
  );
}
