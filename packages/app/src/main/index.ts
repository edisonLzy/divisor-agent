import { join } from "path";

import { app, BrowserWindow } from "electron";

import { bindAgentRuntimeIPC } from "./agent-ipc.js";
import { AgentPool } from "./agent-pool.js";
import { EngineeringService } from "./engineering/index.js";

function createWindow() {
  const mainWindow = new BrowserWindow({
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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

function createAgentRuntime() {
  const agentPool = new AgentPool();
  return agentPool;
}

app.whenReady().then(async () => {
  const browserWindow = createWindow();
  const agentPool = createAgentRuntime();
  const engineeringService = new EngineeringService();

  process.on("uncaughtException", (error) => {
    void engineeringService.recordEngineeringEvent({
      type: "main_error",
      severity: "error",
      source: "main",
      message: error.message,
      stack: error.stack,
    });
  });

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    void engineeringService.recordEngineeringEvent({
      type: "unhandled_rejection",
      severity: "error",
      source: "main",
      message: error.message,
      stack: error.stack,
    });
  });

  const unbind = bindAgentRuntimeIPC(agentPool, browserWindow, engineeringService);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("quit", () => {
    unbind();
    agentPool.destroyAll();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

console.log("Divisor Agent main process started!");
