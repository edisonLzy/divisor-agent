import { contextBridge, ipcRenderer } from "electron";

import type { IpcEventMap } from "../shared/message-ipc.js";
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

type InvokeArgs<C extends keyof AgentIPC> =
  Parameters<AgentIPC[C]> extends [] ? [] : Parameters<AgentIPC[C]>;

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <C extends AllowedChannel & keyof AgentIPC>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<AgentIPC[C]>>> => {
    if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<Awaited<ReturnType<AgentIPC[C]>>>;
  },

  on: <E extends AllowedEvent & keyof IpcEventMap>(
    event: E,
    callback: (payload: IpcEventMap[E]) => void,
  ) => {
    if (!(ALLOWED_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`IPC event not allowed: ${event}`);
    }
    const subscription = (_event: Electron.IpcRendererEvent, payload: IpcEventMap[E]) =>
      callback(payload);
    ipcRenderer.on(event, subscription);
    return () => ipcRenderer.removeListener(event, subscription);
  },
});

export type { AgentIPC };
