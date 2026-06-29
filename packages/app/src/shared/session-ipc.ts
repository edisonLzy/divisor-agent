import type { AgentMessage, AppUserMessage } from "@earendil-works/pi-agent-core";

import type { AgentSessionScope } from "./events-ipc";
import type { AvailableModel } from "./models-ipc";
import type { PermissionMode } from "./permissions-ipc";
import type { UserInteractionSubmission } from "./user-interaction-ipc";

export interface AgentSessionIPC {
  prompt: (sessionId: string, message: AppUserMessage) => Promise<void>;
  clearAllQueues: (sessionId: string) => Promise<void>;
  runOneTimeAgent: (
    messages: AgentMessage[],
    options: {
      timeout?: number;
      systemPrompt: string;
      model: Pick<AvailableModel, "providerId" | "modelId">;
    },
  ) => Promise<string>;
  abortPrompt: (sessionId: string) => Promise<void>;
  setHistoryMessages: (sessionId: string, messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
  setSessionScope: (sessionId: string, scope: AgentSessionScope) => Promise<void>;
  destroySession: (sessionId: string) => Promise<void>;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
  resolveUserInteraction: (
    sessionId: string,
    requestId: string,
    submission: UserInteractionSubmission,
  ) => Promise<void>;
}
