import type { AgentMessage } from "@mariozechner/pi-agent-core";

import type { AgentSessionScope } from "./events-ipc";
import type { AvailableModel } from "./models-ipc";
import type { PermissionMode, PermissionResolution } from "./permissions-ipc";

export interface PromptMetadata {
  model?: Pick<AvailableModel, "modelId" | "providerId">;
  skillIds?: string[];
}

export interface AgentSessionIPC {
  prompt: (sessionId: string, content: string, metadata?: PromptMetadata) => Promise<void>;
  steerPrompt: (sessionId: string, content: string, metadata?: PromptMetadata) => Promise<void>;
  followUpPrompt: (sessionId: string, content: string, metadata?: PromptMetadata) => Promise<void>;
  clearPendingPrompts: (sessionId: string) => Promise<void>;
  abortPrompt: (sessionId: string) => Promise<void>;
  setHistoryMessages: (sessionId: string, messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
  setSessionScope: (sessionId: string, scope: AgentSessionScope) => Promise<void>;
  destroySession: (sessionId: string) => Promise<void>;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    resolution: PermissionResolution,
  ) => Promise<void>;
}
