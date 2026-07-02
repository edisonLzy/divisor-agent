import { Plus, X } from "lucide-react";

import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { TabInfo } from "@shared/browser-artifact-ipc";

interface BrowserTabBarProps {
  activeTabId?: string;
  artifactId: string;
  className?: string;
  onSelect?: (tabId: string) => void;
  sessionId: string;
  tabs: TabInfo[];
}

export function BrowserTabBar({
  activeTabId,
  artifactId,
  className,
  onSelect,
  sessionId,
  tabs,
}: BrowserTabBarProps) {
  const { invoke } = useElectronIPC();

  async function open() {
    const created = await invoke("browserOpenTab", sessionId, artifactId, "about:blank");
    if (created && typeof created === "object" && "id" in created) {
      onSelect?.((created as TabInfo).id);
    }
  }

  async function close(tabId: string, event: React.MouseEvent) {
    event.stopPropagation();
    await invoke("browserCloseTab", sessionId, artifactId, tabId);
  }

  async function select(tabId: string) {
    await invoke("browserSwitchTab", sessionId, artifactId, tabId);
    onSelect?.(tabId);
  }

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto", className)}>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <button
            className={cn(
              "group/tab flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
              active
                ? "border-sky-300/60 bg-sky-300/10 text-foreground"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
            )}
            key={tab.id}
            onClick={() => void select(tab.id)}
            type="button"
          >
            <span className="truncate max-w-32">{tab.title || tab.url || "New Tab"}</span>
            {tabs.length > 1 ? (
              <span
                className="opacity-0 group-hover/tab:opacity-100"
                onClick={(event) => void close(tab.id, event)}
                role="button"
                aria-label={`Close ${tab.title}`}
              >
                <X className="size-3" />
              </span>
            ) : null}
          </button>
        );
      })}
      <Button
        aria-label="New tab"
        onClick={() => void open()}
        size="icon-xs"
        variant="ghost"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}