import type { AgentMessage } from "@mariozechner/pi-agent-core";

import type { AvailableModel } from "./models-ipc";

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
  setHistoryMessages: (sessionId: string, messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
  searchWorkspaceFiles: (sessionId: string, query: string) => Promise<WorkspaceFileItem[]>;
}
