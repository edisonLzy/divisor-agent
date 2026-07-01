import { ExtensionsPreloadAPI } from "@divisor-agent/extension-core/common/ipc/preload";
import { contextBridge, ipcRenderer } from "electron";

import type {
  AgentRuntimeIPC,
  AllowedMainExposeEvents,
  AllowedRenderInvokeEvents,
} from "../shared/events-ipc.js";
import { ALLOWED_MAIN_EXPOSE_EVENTS, ALLOWED_RENDER_INVOKE_EVENTS } from "../shared/events-ipc.js";

type InvokeArgs<C extends keyof AgentRuntimeIPC> = Parameters<AgentRuntimeIPC[C]>;

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <C extends AllowedRenderInvokeEvents>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>> => {
    if (!(ALLOWED_RENDER_INVOKE_EVENTS as readonly string[]).includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }

    return ipcRenderer.invoke(channel, ...args) as Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>>;
  },

  on: <E extends keyof AllowedMainExposeEvents>(
    event: E,
    callback: (payload: AllowedMainExposeEvents[E]) => void,
  ) => {
    if (!(ALLOWED_MAIN_EXPOSE_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`IPC event not allowed: ${event}`);
    }

    const subscription = (
      _event: Electron.IpcRendererEvent,
      payload: AllowedMainExposeEvents[E],
    ) => {
      callback(payload);
    };

    ipcRenderer.on(event, subscription);

    return () => {
      ipcRenderer.removeListener(event, subscription);
    };
  },
});

const extensionsAPI = new ExtensionsPreloadAPI();
contextBridge.exposeInMainWorld("extensionsAPI", {
  invoke: extensionsAPI.invoke,
  on: extensionsAPI.on,
});
