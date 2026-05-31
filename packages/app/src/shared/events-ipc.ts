import type { AgentEvent } from "@mariozechner/pi-agent-core";

import { AgentModelsIPC } from "./models-ipc";
import type { PermissionRequestedEvent } from "./permissions-ipc";
import { AgentSessionIPC } from "./session-ipc";

type SessionTagged<T> = T & { sessionId: string };
type AgentRuntimeEvent = AgentEvent | PermissionRequestedEvent;

// main -> renderer events. These are verified at compile-time to be a subset of the
export const ALLOWED_MAIN_EXPOSE_EVENTS: AgentRuntimeEvent["type"][] = [
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
];

/**
 * Each agent event is tagged with the sessionId so the renderer can
 * route multi-session events to the correct session's state store.
 */
export type AllowedMainExposeEvents = {
  [K in AgentRuntimeEvent as K["type"]]: SessionTagged<K>;
};

// render -> main

export type AgentRuntimeIPC = AgentModelsIPC & AgentSessionIPC;

export const ALLOWED_RENDER_INVOKE_EVENTS: (keyof AgentRuntimeIPC)[] = [
  "setModel",
  "getAvailableModels",
  "prompt",
  "setHistoryMessages",
  "setSessionId",
  "searchWorkspaceFiles",
  "setPermissionMode",
  "resolvePermissionRequest",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
