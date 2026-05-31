import type { AgentMessage } from "@mariozechner/pi-agent-core";

import type { AvailableModel } from "./models-ipc";
import type { PermissionMode, PermissionResolution } from "./permissions-ipc";

export interface WorkspaceFileItem {
  name: string;
  path: string;
}

export interface AgentSessionIPC {
  prompt: (
    sessionId: string,
    content: string,
    model?: Pick<AvailableModel, "modelId" | "providerId">,
  ) => Promise<void>;
  abortPrompt: (sessionId: string) => Promise<void>;
  setHistoryMessages: (sessionId: string, messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
  searchWorkspaceFiles: (sessionId: string, query: string) => Promise<WorkspaceFileItem[]>;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    resolution: PermissionResolution,
  ) => Promise<void>;
}
