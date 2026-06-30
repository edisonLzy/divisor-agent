import { join } from "path";

import { app, BrowserWindow } from "electron";

import { bindAgentRuntimeIPC } from "./agent-ipc.js";
import { AgentPool } from "./agent-pool.js";

function createWindow() {
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
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission, _requestingOrigin, details) => {
      return (
        webContents === mainWindow.webContents &&
        permission === "media" &&
        details.mediaType === "audio"
      );
    },
  );

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
      const allowMicrophone =
        webContents === mainWindow.webContents &&
        permission === "media" &&
        mediaTypes?.includes("audio") === true &&
        !mediaTypes.includes("video");

      callback(allowMicrophone);
    },
  );

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

  const unbind = bindAgentRuntimeIPC(agentPool, browserWindow);

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
