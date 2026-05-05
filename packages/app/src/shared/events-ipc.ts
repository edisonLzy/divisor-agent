import type { AgentEvent } from "@mariozechner/pi-agent-core";

import { AgentModelsIPC } from "./models-ipc";
import { AgentSessionIPC } from "./session-ipc";

type EventToNested<T extends { type: string }> = {
  [K in T as K["type"]]: K;
};

// main -> renderer events. These are verified at compile-time to be a subset of the
export const ALLOWED_MAIN_EXPOSE_EVENTS: AgentEvent["type"][] = [
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
];

export type AllowedMainExposeEvents = EventToNested<AgentEvent>;

// render -> main

export type AgentRuntimeIPC = AgentModelsIPC & AgentSessionIPC;

export const ALLOWED_RENDER_INVOKE_EVENTS: (keyof AgentRuntimeIPC)[] = [
  "setModel",
  "getAvailableModels",
  "prompt",
  "setHistoryMessages",
  "setSessionId",
  "searchWorkspaceFiles",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
