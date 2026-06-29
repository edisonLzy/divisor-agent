import {
  EXTENSION_INVOKE_CHANNEL,
  type ExtensionIPCInvokeRequest,
} from "@divisor-agent/extension-core/common";
import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";

import type { AgentPool } from "./agent-pool";

type UnbindFunction = VoidFunction;

export abstract class AbstractAgentIPCHandler<AgentIPC> {
  protected typedIpcMain = createTypedIpcMain<AgentIPC>();

  protected unbind: UnbindFunction | null = null;

  private browserWindow: BrowserWindow | null = null;

  constructor(initialBrowserWindow: BrowserWindow) {
    this.browserWindow = initialBrowserWindow;
  }

  protected get currentBrowserWindow(): BrowserWindow | null {
    return this.browserWindow;
  }

  public updateBrowserWindow = (browserWindow: BrowserWindow) => {
    this.browserWindow = browserWindow;
  };

  public sendMessageToRenderer(name: string, data: unknown) {
    const browserWindow = this.browserWindow;
    if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
      return;
    }

    browserWindow.webContents.send(name, data);
  }

  // bind ipcMain events; subclasses must register their IPC channels here
  // and return a function that reverses the registration.
  protected abstract bind(): UnbindFunction;
}

/**
 * Register the extension IPC bridge on raw `ipcMain` (it is not part of the
 * AgentIPC surface — channels are dispatched by extensionId/method at runtime).
 * Returns an unbind function. All AgentPool-specific IPC channels are registered
 * by `AgentPool.bind()` itself.
 */
export function bindAgentRuntimeIPC(agentPool: AgentPool): () => void {
  ipcMain.handle(EXTENSION_INVOKE_CHANNEL, (_event, input: unknown) => {
    const request = parseExtensionIPCRequest(input);
    return agentPool.invokeExtensionIPC(request.extensionId, request.method, request.args);
  });

  return () => {
    ipcMain.removeHandler(EXTENSION_INVOKE_CHANNEL);
  };
}

function parseExtensionIPCRequest(input: unknown): ExtensionIPCInvokeRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid extension IPC request");
  }

  const request = input as Partial<ExtensionIPCInvokeRequest>;
  if (
    typeof request.extensionId !== "string" ||
    !request.extensionId.trim() ||
    typeof request.method !== "string" ||
    !request.method.trim() ||
    !Array.isArray(request.args)
  ) {
    throw new Error("Invalid extension IPC request");
  }

  return {
    args: request.args,
    extensionId: request.extensionId,
    method: request.method,
  };
}

function createTypedIpcMain<AgentIPC = Record<string, any>>() {
  return {
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as unknown as string, (_, ...params) => {
        return (listener as any)(...params);
      });
    },
    removeHandler<C extends keyof AgentIPC = keyof AgentIPC>(channel: C) {
      ipcMain.removeHandler(channel as string);
    },
  };
}
