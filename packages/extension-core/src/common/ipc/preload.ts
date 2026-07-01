import { ipcRenderer } from "electron";

import { extensionEventChannel, extensionInvokeChannel } from "./constant.js";
import type { ExtensionIPCTransport } from "./types.js";

/** Electron preload implementation. Arrow fields keep methods as contextBridge-own properties. */
export class ExtensionsPreloadAPI implements ExtensionIPCTransport {
  invoke: ExtensionIPCTransport["invoke"] = (extensionId, method, args) => {
    return ipcRenderer.invoke(extensionInvokeChannel(extensionId, method), ...args);
  };

  on: ExtensionIPCTransport["on"] = (extensionId, event, listener) => {
    const channel = extensionEventChannel(extensionId, event);
    const subscription = (_electronEvent: Electron.IpcRendererEvent, ...args: unknown[]) => {
      listener(...args);
    };

    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  };
}
