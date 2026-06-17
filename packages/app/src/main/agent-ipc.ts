import { BrowserWindow, ipcMain } from "electron";

import type { AgentModelsIPC } from "../shared/models-ipc";
import type { AgentSessionIPC } from "../shared/session-ipc";
import type { AgentSkillsIPC } from "../shared/skills-ipc";
import type { AgentPool } from "./agent-pool";

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
  typedIpcMain.handle("getModelConfig", agentPool.getModelConfig);
  typedIpcMain.handle("saveModelConfig", agentPool.saveModelConfig);
  typedIpcMain.handle("prompt", agentPool.prompt);
  typedIpcMain.handle("abortPrompt", agentPool.abortPrompt);
  typedIpcMain.handle("setHistoryMessages", agentPool.setHistoryMessages);
  typedIpcMain.handle("setSessionId", agentPool.setSessionId);
  typedIpcMain.handle("setSessionScope", agentPool.setSessionScope);
  typedIpcMain.handle("destroySession", agentPool.destroySession);
  typedIpcMain.handle("setPermissionMode", agentPool.setPermissionMode);
  typedIpcMain.handle("resolvePermissionRequest", agentPool.resolvePermissionRequest);
  typedIpcMain.handle("listSkills", agentPool.listSkills);
  typedIpcMain.handle("setSkillEnabled", agentPool.setSkillEnabled);

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
  type AgentIPC = AgentModelsIPC & AgentSessionIPC & AgentSkillsIPC;
  return {
    ...ipcMain,
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as unknown as string, (_, ...params) => {
        return (listener as any)(...params);
      });
    },
  };
}
