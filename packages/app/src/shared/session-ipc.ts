import type { AgentMessage, AppUserMessage } from "@earendil-works/pi-agent-core";

import type { AgentSessionScope } from "./events-ipc";
import type { PermissionMode, PermissionResolution } from "./permissions-ipc";

export interface AgentSessionIPC {
  prompt: (sessionId: string, message: AppUserMessage) => Promise<void>;
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
