import type { BrowserWindow } from "electron";

import type { SystemIPC } from "../../shared/system-ipc";
import { AbstractAgentIPCHandler } from "../agent-ipc";

export class BrowserWindowManager extends AbstractAgentIPCHandler<SystemIPC> implements SystemIPC {
  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.unbind = this.bind();
  }

  isWindowFullScreen = async (): Promise<boolean> => {
    const win = this.currentBrowserWindow;
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  };

  protected override bind(): VoidFunction {
    this.typedIpcMain.handle("isWindowFullScreen", this.isWindowFullScreen);
    return () => {
      this.typedIpcMain.removeHandler("isWindowFullScreen");
    };
  }

  destroy() {
    this.unbind?.();
  }
}
