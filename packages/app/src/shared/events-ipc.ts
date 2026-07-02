import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type {
  BrowserArtifactIPC,
  BrowserScreenshotUpdatedEvent,
  BrowserStateChangedEvent,
  BrowserTabChangedEvent,
} from "./browser-artifact-ipc";
import type { FileSystemIPC } from "./file-system-ipc";
import type { AgentModelsIPC } from "./models-ipc";
import type { PermissionRequestedEvent } from "./permissions-ipc";
import type { AgentSessionIPC } from "./session-ipc";
import type { AgentSkillsIPC } from "./skills-ipc";
import type { SystemIPC } from "./system-ipc";

export type AgentSessionScope = "main" | "side-chat";
type SessionTagged<T> = T & { scope: AgentSessionScope; sessionId: string };
type AgentRuntimeEvent =
  | AgentEvent
  | PermissionRequestedEvent
  | BrowserStateChangedEvent
  | BrowserTabChangedEvent
  | BrowserScreenshotUpdatedEvent;

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
  "browser_state_changed",
  "browser_tab_changed",
  "browser_screenshot_updated",
];

/**
 * Each agent event is tagged with the sessionId so the renderer can
 * route multi-session events to the correct session's state store.
 */
export type AllowedMainExposeEvents = {
  [K in AgentRuntimeEvent as K["type"]]: SessionTagged<K>;
};

// render -> main

export type AgentRuntimeIPC = AgentModelsIPC &
  AgentSessionIPC &
  AgentSkillsIPC &
  BrowserArtifactIPC &
  FileSystemIPC &
  SystemIPC;

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
  "browserCreate",
  "browserDestroy",
  "browserSetBounds",
  "browserNavigate",
  "browserGoBack",
  "browserGoForward",
  "browserReload",
  "browserCaptureForAnnotation",
  "browserSetVisible",
  "browserSetMode",
  "browserObserve",
  "browserDispatch",
  "browserOpenTab",
  "browserSwitchTab",
  "browserCloseTab",
  "browserListTabs",
  "browserRegisterArtifact",
  "browserUnregisterArtifact",
  "browserUpdateAllowlist",
  "fsReadTextFile",
  "isWindowFullScreen",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
