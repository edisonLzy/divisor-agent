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

  setWindowControlsTheme = async (theme: "light" | "dark"): Promise<void> => {
    if (process.platform === "darwin") return;

    const win = this.currentBrowserWindow;
    if (!win || win.isDestroyed()) return;

    win.setTitleBarOverlay({
      color: "#00000000",
      symbolColor: theme === "dark" ? "#f3eee5" : "#141111",
      height: 48,
    });
  };

  protected override bind(): VoidFunction {
    this.typedIpcMain.handle("isWindowFullScreen", this.isWindowFullScreen);
    this.typedIpcMain.handle("setWindowControlsTheme", this.setWindowControlsTheme);
    return () => {
      this.typedIpcMain.removeHandler("isWindowFullScreen");
      this.typedIpcMain.removeHandler("setWindowControlsTheme");
    };
  }

  destroy() {
    this.unbind?.();
  }
}
