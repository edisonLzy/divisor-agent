import { join } from "node:path";

import { BrowserWindow, globalShortcut, screen, type WebContents } from "electron";

import type { AppWindowKind } from "../shared/window-ipc.js";

const COMPANION_SHORTCUT = "Alt+Space";

export class WindowManager {
  private companionWindow: BrowserWindow | null = null;
  private isQuitting = false;
  private mainWindow: BrowserWindow | null = null;

  createMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }

    const mainWindow = new BrowserWindow({
      icon: join(__dirname, "../../resources/icon.png"),
      frame: false,
      titleBarStyle: "hiddenInset",
      vibrancy: "under-window",
      visualEffectState: "active",
      backgroundColor: "#00000000",
      width: 1200,
      height: 800,
      x: 100,
      y: 100,
      title: "Divisor Agent",
      webPreferences: this.getWebPreferences(),
    });

    this.mainWindow = mainWindow;
    mainWindow.on("closed", () => {
      if (this.mainWindow === mainWindow) {
        this.mainWindow = null;
      }
    });
    this.loadRenderer(mainWindow, "main");
    return mainWindow;
  }

  createCompanionWindow() {
    if (this.companionWindow && !this.companionWindow.isDestroyed()) {
      return this.companionWindow;
    }

    const companionWindow = new BrowserWindow({
      width: 510,
      height: 660,
      minWidth: 420,
      minHeight: 520,
      show: false,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: true,
      backgroundColor: "#00000000",
      title: "Divisor Companion",
      webPreferences: this.getWebPreferences(),
    });

    this.companionWindow = companionWindow;
    companionWindow.setAlwaysOnTop(true, "floating");
    this.positionCompanionWindow(companionWindow);
    if (process.platform === "darwin") {
      companionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    companionWindow.on("close", (event) => {
      if (this.isQuitting) return;
      event.preventDefault();
      companionWindow.hide();
    });
    companionWindow.on("closed", () => {
      if (this.companionWindow === companionWindow) {
        this.companionWindow = null;
      }
    });
    this.loadRenderer(companionWindow, "companion");
    return companionWindow;
  }

  registerShortcut() {
    const registered = globalShortcut.register(COMPANION_SHORTCUT, () => {
      this.toggleCompanionWindow();
    });

    if (!registered) {
      console.warn(`Unable to register companion shortcut: ${COMPANION_SHORTCUT}`);
    }
  }

  toggleCompanionWindow() {
    const companionWindow = this.createCompanionWindow();
    if (companionWindow.isVisible()) {
      companionWindow.hide();
      return;
    }

    companionWindow.show();
    companionWindow.focus();
    companionWindow.webContents.send("focus_companion_input", undefined);
  }

  hideCompanionWindow() {
    this.companionWindow?.hide();
  }

  openSessionInMainWindow(sessionId: string) {
    const mainWindow = this.createMainWindow();
    const sendSession = () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("open_session_in_main", { sessionId });
      }
    };

    mainWindow.show();
    mainWindow.focus();
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once("did-finish-load", sendSession);
    } else {
      sendSession();
    }
    this.hideCompanionWindow();
  }

  getWindowKind(webContents: WebContents): AppWindowKind {
    return this.companionWindow?.webContents.id === webContents.id ? "companion" : "main";
  }

  getWindows() {
    return [this.mainWindow, this.companionWindow].filter((window): window is BrowserWindow =>
      Boolean(window && !window.isDestroyed()),
    );
  }

  prepareToQuit() {
    this.isQuitting = true;
    globalShortcut.unregister(COMPANION_SHORTCUT);
  }

  private getWebPreferences() {
    return {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    };
  }

  private loadRenderer(window: BrowserWindow, kind: AppWindowKind) {
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      url.searchParams.set("window", kind);
      void window.loadURL(url.toString());
      return;
    }

    void window.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { window: kind },
    });
  }

  private positionCompanionWindow(companionWindow: BrowserWindow) {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const bounds = companionWindow.getBounds();
    companionWindow.setPosition(
      Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2),
      Math.round(display.workArea.y + display.workArea.height - bounds.height - 48),
    );
  }
}
