import { cn } from "@renderer/lib/utils";
import Fuse from "fuse.js";
import { BoxIcon } from "lucide-react";

import type { CommandItem } from "../types";

const MAX_COMMAND_RESULTS = 20;

interface SuggestionsPanelProps {
  items: CommandItem[];
  query: string;
  selectedIndex: number;
  onSelect: (item: CommandItem) => void;
  onHighlight: (index: number) => void;
  maxHeight: number;
}

interface CommandGroup {
  label: string;
  items: Array<{ item: CommandItem; index: number }>;
}

export function filterCommandItems(items: CommandItem[], query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return items.slice(0, MAX_COMMAND_RESULTS);
  }

  const fuse = new Fuse(items, {
    threshold: 0.35,
    ignoreLocation: true,
    keys: ["name", "description", "group", "extra"],
  });

  return fuse
    .search(normalizedQuery)
    .map((result) => result.item)
    .slice(0, MAX_COMMAND_RESULTS);
}

export function groupCommandItems(items: CommandItem[]) {
  return items.reduce<CommandGroup[]>((result, item, index) => {
    const currentGroup = result[result.length - 1];

    if (!currentGroup || currentGroup.label !== item.group) {
      result.push({ label: item.group, items: [{ item, index }] });
      return result;
    }

    currentGroup.items.push({ item, index });
    return result;
  }, []);
}

export function SuggestionsPanel({
  items,
  query,
  selectedIndex,
  onSelect,
  onHighlight,
  maxHeight,
}: SuggestionsPanelProps) {
  const filteredItems = filterCommandItems(items, query);
  const groups = groupCommandItems(filteredItems);

  if (filteredItems.length === 0) {
    return (
      <div className="rounded-[20px] border border-border/80 bg-popover/95 px-4 py-3.5 text-sm text-muted-foreground shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]">
        No slash commands found
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto rounded-[20px] border border-border/80 bg-popover/95 p-2 shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]"
      style={{ maxHeight }}
    >
      {groups.map((group, groupIndex) => (
        <div key={group.label}>
          <div
            className={cn(
              "px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground",
              groupIndex === 0 ? "pt-1" : "pt-2",
            )}
          >
            {group.label}
          </div>
          {group.items.map(({ item, index }) => (
            <button
              key={item.id}
              type="button"
              data-command-index={index}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-muted",
              )}
              onClick={() => onSelect(item)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
                <BoxIcon />
              </span>
              <span className="min-w-0 flex flex-1 items-baseline gap-2">
                <span className="truncate text-sm font-medium text-current">{item.name}</span>
                <span className="truncate text-xs text-muted-foreground">{item.description}</span>
              </span>
              {item.extra ? (
                <span className="shrink-0 text-xs text-muted-foreground">{item.extra}</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
