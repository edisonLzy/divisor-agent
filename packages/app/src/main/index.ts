import { join } from "path";

import { app, BrowserWindow } from "electron";

import { bindAgentRuntimeIPC } from "./agent-ipc.js";
import { AgentPool } from "./agent-pool.js";

/**
 * Resolve the app icon path.
 *
 * - Dev mode: `__dirname` is `<pkg>/out/main`, so `../../resources/icon.png`
 *   resolves to `<pkg>/resources/icon.png`.
 * - Packaged mode: `asarUnpack: resources/**` puts the file at
 *   `<process.resourcesPath>/resources/icon.png`.
 */
function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "resources", "icon.png");
  }
  return join(__dirname, "../../resources/icon.png");
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    icon: resolveAppIconPath(),
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
  // On macOS the dock icon is independent of `BrowserWindow.icon` — without
  // this call the launcher/dock keeps showing the default Electron icon.
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(resolveAppIconPath());
  }

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
