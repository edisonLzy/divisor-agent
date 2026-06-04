import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { JSONContent } from "@tiptap/core";

import type { AvailableModel } from "./models-ipc";
import type { PermissionMode, PermissionResolution } from "./permissions-ipc";

export interface PromptMetadata {
  model?: Pick<AvailableModel, "modelId" | "providerId">;
  skillIds?: string[];
  jsonContent?: JSONContent;
}

export interface AgentSessionIPC {
  prompt: (sessionId: string, content: string, metadata?: PromptMetadata) => Promise<void>;
  abortPrompt: (sessionId: string) => Promise<void>;
  setHistoryMessages: (sessionId: string, messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    resolution: PermissionResolution,
  ) => Promise<void>;
}
