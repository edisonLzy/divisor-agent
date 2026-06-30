import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";

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
