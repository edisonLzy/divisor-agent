import { join } from "path";

import {
  EXTENSION_EVENT_CHANNEL,
  type ExtensionIPCEventEnvelope,
} from "@divisor-agent/extension-core/common";
import { app, BrowserWindow } from "electron";

import { bindAgentRuntimeIPC } from "./agent-ipc.js";
import { AgentPool } from "./agent-pool.js";

let agentPool: AgentPool | undefined;
let allowQuit = false;
let mainWindow: BrowserWindow | null = null;
let unbindAgentRuntimeIPC: (() => void) | undefined;

function getBrowserWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function createWindow() {
  const browserWindow = new BrowserWindow({
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
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = browserWindow;
  browserWindow.on("closed", () => {
    if (mainWindow === browserWindow) mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void browserWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return browserWindow;
}

function emitExtensionIPCEvent(envelope: ExtensionIPCEventEnvelope) {
  const browserWindow = getBrowserWindow();
  if (!browserWindow || browserWindow.webContents.isDestroyed()) return;
  browserWindow.webContents.send(EXTENSION_EVENT_CHANNEL, envelope);
}

app.whenReady().then(() => {
  createWindow();
  agentPool = new AgentPool({ emitExtensionIPCEvent, getBrowserWindow });
  unbindAgentRuntimeIPC = bindAgentRuntimeIPC(agentPool, getBrowserWindow);

  app.on("activate", () => {
    if (!getBrowserWindow()) createWindow();
  });
});

app.on("before-quit", (event) => {
  if (allowQuit || !agentPool) return;

  event.preventDefault();
  allowQuit = true;
  unbindAgentRuntimeIPC?.();

  void agentPool.destroyAll().finally(() => {
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

console.log("Divisor Agent main process started!");
