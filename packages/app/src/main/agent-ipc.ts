import { BrowserWindow, ipcMain } from "electron";

import { AgentModelsIPC } from "../shared/models-ipc";
import { AgentSessionIPC } from "../shared/session-ipc";
import { AgentPool } from "./agent-pool";

function registerAgentRuntimeHandlers(agentPool: AgentPool, browserWindow: BrowserWindow) {
  const offAny = agentPool.onAny(({ name, data }) => {
    if (browserWindow.isDestroyed() || typeof name !== "string") {
      return;
    }

    browserWindow.webContents.send(name, data);
  });

  return () => {
    offAny();
  };
}

function registerIPCHandlers(agentPool: AgentPool) {
  const typedIpcMain = createTypedIpcMain();

  typedIpcMain.handle("setModel", agentPool.setModel);
  typedIpcMain.handle("getAvailableModels", agentPool.getAvailableModels);
  typedIpcMain.handle("prompt", agentPool.prompt);
  typedIpcMain.handle("abortPrompt", agentPool.abortPrompt);
  typedIpcMain.handle("setHistoryMessages", agentPool.setHistoryMessages);
  typedIpcMain.handle("setSessionId", agentPool.setSessionId);
  typedIpcMain.handle("searchWorkspaceFiles", agentPool.searchWorkspaceFiles);
  typedIpcMain.handle("setPermissionMode", agentPool.setPermissionMode);
  typedIpcMain.handle("resolvePermissionRequest", agentPool.resolvePermissionRequest);

  return () => {
    typedIpcMain.removeAllListeners();
  };
}

export function bindAgentRuntimeIPC(
  agentPool: AgentPool,
  browserWindow: BrowserWindow,
): () => void {
  const unregisterAgentRuntimeHandlers = registerAgentRuntimeHandlers(agentPool, browserWindow);
  const unregisterIPCHandlers = registerIPCHandlers(agentPool);

  return () => {
    // Unbind logic here
    unregisterAgentRuntimeHandlers();
    unregisterIPCHandlers();
  };
}

function createTypedIpcMain() {
  type AgentIPC = AgentModelsIPC & AgentSessionIPC;
  return {
    ...ipcMain,
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as unknown as string, (_, ...params) => {
        return (listener as any)(...params);
      });
    },
  };
}
