import { contextBridge, ipcRenderer } from "electron";

import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";

type AgentIPC = AgentModelsIPC & AgentSessionIPC;

// These arrays are verified at compile-time to contain exactly the keys of
// AgentIPC via `satisfies`. Adding or removing a channel from the shared
// types without updating these lists is a compile error.
const ALLOWED_CHANNELS = [
  "setModel",
  "getAvailableModels",
  "prompt",
  "setHistoryMessages",
  "setSessionId",
] as const satisfies readonly (keyof AgentIPC)[];

const ALLOWED_EVENTS = ["agentMessageChunk", "agentMessageDone"] as const;

type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];
type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <C extends AllowedChannel>(
    channel: C,
    ...args: Parameters<AgentIPC[C]>
  ): Promise<ReturnType<AgentIPC[C]>> => {
    if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (event: AllowedEvent, callback: (...args: unknown[]) => void) => {
    if (!(ALLOWED_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`IPC event not allowed: ${event}`);
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(event, subscription);
    return () => ipcRenderer.removeListener(event, subscription);
  },
});

export type { AgentIPC };
