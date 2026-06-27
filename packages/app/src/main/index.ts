import { join } from "path";

import { app, BrowserWindow } from "electron";

import { AgentPool } from "./agent-pool.js";
import { BrowserManager } from "./browser/index.js";
import { FileSystem } from "./file-system/index.js";

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

function createAgentPool() {
  const agentPool = new AgentPool();
  return agentPool;
}

function createBrowserManager() {
  const browserManager = new BrowserManager();
  return browserManager;
}

function createFileSystem() {
  const fileSystem = new FileSystem();
  return fileSystem;
}

app.whenReady().then(async () => {
  // On macOS the dock icon is independent of `BrowserWindow.icon` — without
  // this call the launcher/dock keeps showing the default Electron icon.
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(resolveAppIconPath());
  }

  const browserWindow = createWindow();
  const browserManager = createBrowserManager();
  const fileSystem = createFileSystem();
  const agentPool = createAgentPool();

  // Each module binds its own Emittery events and IPC handlers via
  // `bindEvents(browserWindow)`. AgentPool additionally receives the
  // BrowserManager so it can coordinate the cross-module `destroySession`
  // handler (browser artifacts must be torn down alongside the runtime).
  const unbindAgentPool = agentPool.bindEvents(browserWindow);
  const unbindBrowserManager = browserManager.bindEvents(browserWindow);
  const unbindFileSystem = fileSystem.bindEvents(browserWindow);

  // intersection module event bind
  agentPool.on("session_destroyed", async ({ data }) => {
    const { sessionId } = data;
    await browserManager.destroySession(sessionId);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("quit", () => {
    unbindAgentPool();
    unbindBrowserManager();
    unbindFileSystem();
    agentPool.destroyAll();
    browserManager.destroyAll();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

console.log("Divisor Agent main process started!");
