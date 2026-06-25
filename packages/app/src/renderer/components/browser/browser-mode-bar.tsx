import { Bot, Pause, User } from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { ControlMode } from "@shared/browser-artifact-ipc";

interface BrowserModeBarProps {
  artifactId: string;
  className?: string;
  mode?: ControlMode;
  sessionId: string;
}

const MODES: Array<{
  description: string;
  icon: typeof Bot;
  label: string;
  value: ControlMode;
}> = [
  { description: "Agent can dispatch CDP commands.", icon: Bot, label: "Agent", value: "agent" },
  { description: "You are driving the page; agent is paused.", icon: User, label: "User", value: "user" },
  { description: "Both frozen (modal dialog etc).", icon: Pause, label: "Paused", value: "paused" },
];

export function BrowserModeBar({
  artifactId,
  className,
  mode = "agent",
  sessionId,
}: BrowserModeBarProps) {
  const { invoke } = useElectronIPC();

  async function setMode(next: ControlMode) {
    if (next === mode) return;
    await invoke("browserSetMode", sessionId, artifactId, next);
  }

  return (
    <div className={cn("flex items-center gap-1", className)} style={containerStyle}>
      {MODES.map((entry) => {
        const Icon = entry.icon;
        const active = entry.value === mode;
        return (
          <Button
            aria-pressed={active}
            key={entry.value}
            onClick={() => void setMode(entry.value)}
            size="sm"
            title={entry.description}
            variant={active ? "secondary" : "ghost"}
          >
            <Icon className="size-3.5" />
            {entry.label}
          </Button>
        );
      })}
    </div>
  );
}

const containerStyle: CSSProperties = {
  borderRadius: 6,
  padding: 2,
};