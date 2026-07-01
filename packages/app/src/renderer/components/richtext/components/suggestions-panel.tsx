import { cn } from "@renderer/lib/utils";
import Fuse from "fuse.js";
import { BoxIcon } from "lucide-react";
import { useEffect, useRef } from "react";

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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const filteredItems = filterCommandItems(items, query);
  const groups = groupCommandItems(filteredItems);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const selected = container?.querySelector<HTMLElement>(
      `[data-command-index="${selectedIndex}"]`,
    );

    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filteredItems]);

  if (filteredItems.length === 0) {
    return (
      <div className="rounded-md border-2 border-border bg-popover px-3 py-2.5 text-[12px] text-muted-foreground shadow-[var(--hard-shadow)]">
        No slash commands found
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="overflow-y-auto rounded-md border-2 border-border bg-popover p-1.5 shadow-[var(--hard-shadow)]"
      style={{ maxHeight }}
    >
      {groups.map((group, groupIndex) => (
        <div key={group.label}>
          <div
            className={cn(
              "px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground",
              groupIndex === 0 ? "pt-0.5" : "pt-1.5",
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
                "flex w-full items-center gap-2.5 rounded-sm border-2 px-2.5 py-2 text-left transition-colors",
                index === selectedIndex
                  ? "border-border bg-accent text-accent-foreground"
                  : "border-transparent text-popover-foreground hover:bg-muted",
              )}
              onClick={() => onSelect(item)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border-2 border-border bg-background text-muted-foreground [&_svg]:size-3.5">
                <BoxIcon />
              </span>
              <span className="min-w-0 flex flex-1 items-baseline gap-1.5">
                <span className="shrink-0 text-[13px] font-medium leading-5 text-current">
                  {item.name}
                </span>
                {item.description ? (
                  <span className="truncate text-[11px] leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
              {item.extra ? (
                <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">
                  {item.extra}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
