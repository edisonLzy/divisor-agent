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
        className="h-auto w-72 max-w-72 items-start gap-2 px-3 py-2 **:data-[slot=select-value]:items-start **:data-[slot=select-value]:line-clamp-none"
        aria-label="Select model"
      >
        <SelectValue className="min-w-0">
          {value ? (
            <div className="flex min-w-0 gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {value.modelName}
              </span>
              <span className="truncate text-xs text-muted-foreground">{value.providerName}</span>
            </div>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {isLoading ? "Loading models..." : "Select model"}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        className="w-80 min-w-80 max-h-none overflow-hidden rounded-xl p-0"
      >
        <div className="border-b border-border px-3 py-2.5">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDownCapture={(event) => {
              event.stopPropagation();
            }}
            placeholder="Filter models..."
            className="h-7"
          />
        </div>

        <div className="max-h-48 overflow-x-hidden overflow-y-auto px-2 py-2">
          <SelectGroup className="min-w-0 p-0">
            {filteredModels.map((model) => (
              <SelectItem
                key={`${model.providerId}/${model.modelId}`}
                value={`${model.providerId}/${model.modelId}`}
                className="w-full overflow-hidden rounded-lg px-3 py-2"
              >
                <div className="min-w-0 flex flex-1 flex-col gap-0.5 overflow-hidden pr-3">
                  <span className="block min-w-0 truncate text-sm font-medium text-foreground">
                    {model.modelName}
                  </span>
                  <span className="block min-w-0 truncate text-xs text-muted-foreground">
                    {model.providerName}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          {!isLoading && filteredModels.length === 0 ? (
            <div
              className={cn(
                "px-3 py-3 text-sm text-muted-foreground",
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
