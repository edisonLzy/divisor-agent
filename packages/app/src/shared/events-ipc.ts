import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { FileSystemIPC } from "./file-system-ipc";
import type { AgentModelsIPC } from "./models-ipc";
import type { PermissionRequestedEvent } from "./permissions-ipc";
import type { AgentSessionIPC } from "./session-ipc";
import type { AgentSkillsIPC } from "./skills-ipc";
import type { SystemIPC } from "./system-ipc";
import type { UpdateIPC, UpdateState } from "./update-ipc";

export type AgentSessionScope = "main" | "side-chat";
type SessionTagged<T> = T & { scope: AgentSessionScope; sessionId: string };
type AgentRuntimeEvent = AgentEvent | PermissionRequestedEvent;

// main -> renderer events. These are verified at compile-time to be a subset of the
export const ALLOWED_MAIN_EXPOSE_EVENTS = [
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "permission_requested",
  "update_state",
] as const;

/**
 * Each agent event is tagged with the sessionId so the renderer can
 * route multi-session events to the correct session's state store.
 */
export type AllowedAgentExposeEvents = {
  [K in AgentRuntimeEvent as K["type"]]: SessionTagged<K>;
};

export type AllowedMainExposeEvents = AllowedAgentExposeEvents & {
  update_state: UpdateState;
};

// render -> main

export type AgentRuntimeIPC = AgentModelsIPC &
  AgentSessionIPC &
  AgentSkillsIPC &
  FileSystemIPC &
  SystemIPC &
  UpdateIPC;

export const ALLOWED_RENDER_INVOKE_EVENTS: (keyof AgentRuntimeIPC)[] = [
  "setModel",
  "getAvailableModels",
  "getModelConfig",
  "saveModelConfig",
  "prompt",
  "clearAllQueues",
  "runOneTimeAgent",
  "abortPrompt",
  "setHistoryMessages",
  "setSessionId",
  "setSessionScope",
  "destroySession",
  "setPermissionMode",
  "resolvePermissionRequest",
  "listSkills",
  "setSkillEnabled",
  "fsReadTextFile",
  "isWindowFullScreen",
  "setWindowControlsTheme",
  "getUpdateState",
  "checkForUpdates",
  "startUpdate",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
