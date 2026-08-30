import { join } from "path";

import { app, BrowserWindow } from "electron";

import { AgentPool } from "./agent-pool.js";
import { AppUpdateManager } from "./app-updater.js";
import { BrowserWindowManager } from "./browser-window/index.js";
import { FileSystemManager } from "./file-system/index.js";
import { registerDeepgramAuth } from "./stt/index.js";

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock?.setIcon(join(__dirname, "../../resources/icon-divisor.png"));
  }

  // Inject the Deepgram Authorization header into renderer WebSocket upgrades
  // (see src/main/stt). Must be registered before the renderer can connect.
  registerDeepgramAuth();

  let browserWindow: BrowserWindow | null = createWindow();

  const agentPool = new AgentPool(browserWindow);

  const fsManager = new FileSystemManager(browserWindow);

  const browserWindowManager = new BrowserWindowManager(browserWindow);

  const appUpdateManager = new AppUpdateManager(browserWindow);

  app.on("activate", () => {
    if (!browserWindow || browserWindow.isDestroyed()) {
      browserWindow = createWindow();
      agentPool.updateBrowserWindow(browserWindow);
      fsManager.updateBrowserWindow(browserWindow);
      browserWindowManager.updateBrowserWindow(browserWindow);
      appUpdateManager.updateBrowserWindow(browserWindow);
    }
  });

  app.on("quit", () => {
    void fsManager.destroy();
    void browserWindowManager.destroy();
    appUpdateManager.destroy();
    void agentPool.destroyAll();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

console.log("Divisor Agent main process started!");

function createWindow() {
  const isMac = process.platform === "darwin";
  const mainWindow = new BrowserWindow({
    icon: join(__dirname, "../../resources/icon-divisor.png"),
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 18 } }
      : {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#141111",
            height: 48,
          },
        }),
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

  // Allow microphone-only media access for voice input (Deepgram STT).
  // Rejects video requests to avoid unintentional camera access.
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
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}
