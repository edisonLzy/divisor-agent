import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type { DiscoveredSkill } from "@shared/skills-ipc";
import Mention from "@tiptap/extension-mention";
import type { Editor } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionOptions } from "@tiptap/suggestion";
import { BoxIcon } from "lucide-react";
import { PluginKey } from "prosemirror-state";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

interface SlashCommandItem {
  id: string;
  kind: "skill";
  label: string;
  name: string;
  description: string;
  groupLabel: string;
  scope?: DiscoveredSkill["scope"];
}

interface UseSlashCommandsOptions {
  onOpenChange?: (isOpen: boolean) => void;
  onSelect?: () => void;
}

interface UseSlashCommandsResult {
  extension: ReturnType<typeof Mention.configure>;
  getSelectedSkillIds: (editor: Editor | null) => string[];
}

const MAX_SKILL_SEARCH_RESULTS = 20;

export function useSlashCommands(options: UseSlashCommandsOptions = {}): UseSlashCommandsResult {
  const { invoke } = useElectronIPC();
  const skillsCacheRef = useRef<DiscoveredSkill[] | null>(null);
  const onOpenChangeRef = useRef(options.onOpenChange);
  const onSelectRef = useRef(options.onSelect);

  onOpenChangeRef.current = options.onOpenChange;
  onSelectRef.current = options.onSelect;

  const searchSlashCommands = useCallback(
    async (query: string): Promise<SlashCommandItem[]> => {
      if (!skillsCacheRef.current) {
        skillsCacheRef.current = await invoke("listSkills");
      }

      return filterSkills(skillsCacheRef.current, query).map((skill) => ({
        id: skill.id,
        kind: "skill",
        label: skill.name,
        name: skill.name,
        description: skill.description,
        groupLabel: "Skills",
        scope: skill.scope,
      }));
    },
    [invoke],
  );

  const extension = useMemo(() => {
    const SlashCommandMention = Mention.extend({
      name: "slashCommandMention",
    });

    return SlashCommandMention.configure({
      HTMLAttributes: {
        class:
          "inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-200",
      },
      renderText({ node, suggestion }) {
        return `${suggestion?.char ?? "/"}${node.attrs.label ?? node.attrs.id ?? ""}`;
      },
      suggestion: createSlashCommandSuggestion(searchSlashCommands, {
        onOpenChange: (isOpen) => onOpenChangeRef.current?.(isOpen),
        onSelect: () => onSelectRef.current?.(),
      }),
    });
  }, [searchSlashCommands]);

  return {
    extension,
    getSelectedSkillIds,
  };
}

function SlashCommandSuggestionPopup({
  items,
  selectedIndex,
  command,
  onHighlight,
  maxHeight,
}: {
  items: SlashCommandItem[];
  selectedIndex: number;
  command: (item: SlashCommandItem) => void;
  onHighlight: (index: number) => void;
  maxHeight: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${selectedIndex}"]`,
    );
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="rounded-[20px] border border-border/80 bg-popover/95 px-4 py-3.5 text-sm text-muted-foreground shadow-[0_24px_64px_rgb(15_23_42/0.18)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgb(0_0_0/0.45)]">
        No slash commands found
      </div>
    );
  }

  const groups = items.reduce<
    Array<{ label: string; items: Array<{ item: SlashCommandItem; index: number }> }>
  >((result, item, index) => {
    const currentGroup = result[result.length - 1];

    if (!currentGroup || currentGroup.label !== item.groupLabel) {
      result.push({ label: item.groupLabel, items: [{ item, index }] });
      return result;
    }

    currentGroup.items.push({ item, index });
    return result;
  }, []);

  return (
    <div
      ref={listRef}
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
              onClick={() => command(item)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
                <BoxIcon className="size-4 shrink-0" />
              </span>
              <span className="min-w-0 flex flex-1 items-baseline gap-2">
                <span className="truncate text-sm font-medium text-current">{item.name}</span>
                <span className="truncate text-xs text-muted-foreground">{item.description}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.scope ? scopeLabel[item.scope] : item.kind}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const scopeLabel: Record<DiscoveredSkill["scope"], string> = {
  system: "系统",
  project: "项目",
  user: "个人",
};

function createSlashCommandSuggestion(
  onSearch: (query: string) => SlashCommandItem[] | Promise<SlashCommandItem[]>,
  callbacks: UseSlashCommandsOptions,
): Omit<SuggestionOptions<SlashCommandItem>, "editor"> {
  const popupGap = 8;
  const viewportMargin = 16;
  const maxPopupHeight = 360;
  const minPopupHeight = 140;
  const popupWidth = 920;

  return {
    char: "/",
    allowSpaces: true,
    startOfLine: false,
    pluginKey: new PluginKey("slashCommandSuggestion"),
    decorationClass: "file-suggestion-query",
    decorationContent: "search slash commands",
    decorationEmptyClass: "is-empty",
    items: ({ query }) => onSearch(query),
    render: () => {
      let popupElement: HTMLDivElement | null = null;
      let root: Root | null = null;
      let selectedIndex = 0;
      let currentItemsKey = "";
      let popupMaxHeight = maxPopupHeight;
      let rafId: number | null = null;
      let latestProps: {
        items: SlashCommandItem[];
        command: (item: SlashCommandItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      } | null = null;

      function renderPopup() {
        if (!root || !latestProps) {
          return;
        }

        root.render(
          <SlashCommandSuggestionPopup
            items={latestProps.items}
            selectedIndex={selectedIndex}
            command={(item) => latestProps?.command(item)}
            maxHeight={popupMaxHeight}
            onHighlight={(index) => {
              selectedIndex = index;
              renderPopup();
            }}
          />,
        );
      }

      function positionPopup() {
        if (!popupElement || !latestProps) {
          return;
        }

        const rect = latestProps.clientRect?.();
        if (!rect) {
          return;
        }

        const resolvedPopupWidth = Math.min(popupWidth, window.innerWidth - viewportMargin * 2);
        const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
        const spaceAbove = rect.top - viewportMargin;

        popupElement.style.width = `${resolvedPopupWidth}px`;
        popupElement.style.display = "block";

        const measuredHeight = popupElement.offsetHeight || maxPopupHeight;
        const shouldFlip =
          spaceBelow < Math.min(measuredHeight, maxPopupHeight) + popupGap &&
          spaceAbove > spaceBelow;
        const availableSpace = shouldFlip ? spaceAbove : spaceBelow;

        popupMaxHeight = Math.max(minPopupHeight, Math.min(availableSpace, maxPopupHeight));
        renderPopup();

        const finalHeight = popupElement.offsetHeight || popupMaxHeight;
        const left = Math.max(
          viewportMargin,
          Math.min(rect.left, window.innerWidth - resolvedPopupWidth - viewportMargin),
        );
        const top = shouldFlip
          ? Math.max(viewportMargin, rect.top - finalHeight - popupGap)
          : Math.min(window.innerHeight - viewportMargin - finalHeight, rect.bottom + popupGap);

        popupElement.style.left = `${left}px`;
        popupElement.style.top = `${top}px`;
      }

      function schedulePosition() {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }

        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          positionPopup();
        });
      }

      function updatePopup(props: {
        items: SlashCommandItem[];
        command: (item: SlashCommandItem) => void;
        query: string;
        clientRect?: (() => DOMRect | null) | null;
      }) {
        latestProps = props;

        if (!popupElement || !root) {
          return;
        }

        const nextItemsKey = props.items.map((item) => item.id).join("\n");
        if (nextItemsKey !== currentItemsKey) {
          currentItemsKey = nextItemsKey;
          selectedIndex = 0;
        }

        if (props.items.length > 0) {
          selectedIndex = Math.min(selectedIndex, props.items.length - 1);
        }

        renderPopup();
        schedulePosition();
      }

      return {
        onStart: (props) => {
          popupElement = document.createElement("div");
          popupElement.dataset.suggestion = "slash-commands";
          popupElement.style.position = "fixed";
          popupElement.style.zIndex = "50";
          popupElement.style.pointerEvents = "auto";
          document.body.appendChild(popupElement);

          root = createRoot(popupElement);
          callbacks.onOpenChange?.(true);

          window.addEventListener("resize", schedulePosition);
          window.addEventListener("scroll", schedulePosition, true);

          updatePopup(props);
        },
        onUpdate: (props) => {
          updatePopup(props);
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          const items = latestProps?.items ?? [];

          if (props.event.key === "ArrowDown" && items.length > 0) {
            selectedIndex = (selectedIndex + 1) % items.length;
            if (latestProps) updatePopup(latestProps);
            return true;
          }

          if (props.event.key === "ArrowUp" && items.length > 0) {
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            if (latestProps) updatePopup(latestProps);
            return true;
          }

          if (props.event.key === "Enter" && items.length > 0) {
            callbacks.onSelect?.();
            latestProps?.command(items[selectedIndex]);
            return true;
          }

          if (props.event.key === "Escape") {
            if (popupElement) {
              popupElement.style.display = "none";
            }
            return true;
          }

          return false;
        },
        onExit: () => {
          callbacks.onOpenChange?.(false);
          window.removeEventListener("resize", schedulePosition);
          window.removeEventListener("scroll", schedulePosition, true);

          if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
          }

          root?.unmount();
          root = null;
          popupElement?.remove();
          popupElement = null;
        },
      };
    },
  };
}

function filterSkills(skills: DiscoveredSkill[], query: string) {
  const enabledSkills = skills.filter((skill) => skill.enabled);
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return enabledSkills.slice(0, MAX_SKILL_SEARCH_RESULTS);
  }

  return enabledSkills
    .map((skill) => {
      const lowerName = skill.name.toLowerCase();
      const lowerDescription = skill.description.toLowerCase();
      const lowerPath = skill.filePath.toLowerCase();
      let score = Number.POSITIVE_INFINITY;

      if (lowerName === normalizedQuery) score = 0;
      else if (lowerName.startsWith(normalizedQuery)) score = 1;
      else if (lowerName.includes(normalizedQuery)) score = 2;
      else if (lowerDescription.includes(normalizedQuery)) score = 3;
      else if (lowerPath.includes(normalizedQuery)) score = 4;

      return { skill, score };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort(
      (left, right) => left.score - right.score || left.skill.name.localeCompare(right.skill.name),
    )
    .slice(0, MAX_SKILL_SEARCH_RESULTS)
    .map((entry) => entry.skill);
}

function getSelectedSkillIds(editor: Editor | null): string[] {
  const ids = new Set<string>();
  const doc = editor?.getJSON();

  function visit(
    node:
      | {
          type?: string;
          attrs?: { id?: unknown; kind?: unknown };
          content?: unknown[];
        }
      | undefined,
  ) {
    if (!node) {
      return;
    }

    if (
      node.type === "slashCommandMention" &&
      node.attrs?.kind === "skill" &&
      typeof node.attrs?.id === "string"
    ) {
      ids.add(node.attrs.id);
    }

    for (const child of node.content ?? []) {
      visit(
        child as {
          type?: string;
          attrs?: { id?: unknown; kind?: unknown };
          content?: unknown[];
        },
      );
    }
  }

  visit(doc);
  return Array.from(ids);
}
