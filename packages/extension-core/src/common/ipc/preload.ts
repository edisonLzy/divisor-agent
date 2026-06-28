import { ipcRenderer } from "electron";

import { EXTENSION_EVENT_CHANNEL, EXTENSION_INVOKE_CHANNEL } from "./constant.js";
import type { ExtensionIPCEventEnvelope, ExtensionIPCTransport } from "./types.js";

/** Electron preload implementation. Arrow fields keep methods as contextBridge-own properties. */
export class ExtensionsPreloadAPI implements ExtensionIPCTransport {
  invoke: ExtensionIPCTransport["invoke"] = (extensionId, method, args) => {
    return ipcRenderer.invoke(EXTENSION_INVOKE_CHANNEL, { args, extensionId, method });
  };

  on: ExtensionIPCTransport["on"] = (extensionId, event, listener) => {
    const subscription = (
      _electronEvent: Electron.IpcRendererEvent,
      envelope: ExtensionIPCEventEnvelope,
    ) => {
      if (envelope.extensionId === extensionId && envelope.event === event) {
        listener(...envelope.args);
      }
    };

    ipcRenderer.on(EXTENSION_EVENT_CHANNEL, subscription);
    return () => ipcRenderer.removeListener(EXTENSION_EVENT_CHANNEL, subscription);
  };
}
