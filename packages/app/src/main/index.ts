import { app } from "electron";

import { bindAgentRuntimeIPC } from "./agent-ipc.js";
import { AgentPool } from "./agent-pool.js";
import { WindowManager } from "./window-manager.js";

const windowManager = new WindowManager();
const agentPool = new AgentPool();
let unbindIPC: (() => void) | null = null;

app.whenReady().then(() => {
  windowManager.createMainWindow();
  windowManager.createCompanionWindow();
  windowManager.registerShortcut();
  unbindIPC = bindAgentRuntimeIPC(agentPool, windowManager);

  app.on("activate", () => {
    windowManager.createMainWindow();
  });
});

app.on("before-quit", () => {
  windowManager.prepareToQuit();
});

app.on("quit", () => {
  unbindIPC?.();
  agentPool.destroyAll();
});

console.log("Divisor Agent main process started!");
