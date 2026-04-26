import { BrowserWindow, ipcMain } from "electron";

import { AgentModelsIPC } from "../shared/models-ipc";
import { AgentSessionIPC } from "../shared/session-ipc";
import { AgentRuntime } from "./agent-runtime";

function registerAgentRuntimeHandlers(agentRuntime: AgentRuntime, browserWindow: BrowserWindow) {
  agentRuntime.on("agentMessageChunk", ({ data }) => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("agentMessageChunk", data);
    }
  });

  agentRuntime.on("agentMessageDone", ({ data }) => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("agentMessageDone", data);
    }
  });

  return () => {
    agentRuntime.clearListeners();
  };
}

function registerIPCHandlers(agentRuntime: AgentRuntime) {
  const typedIpcMain = createTypedIpcMain();

  typedIpcMain.handle("setModel", agentRuntime.setModel);
  typedIpcMain.handle("getAvailableModels", agentRuntime.getAvailableModels);
  typedIpcMain.handle("prompt", agentRuntime.prompt);
  typedIpcMain.handle("setHistoryMessages", agentRuntime.setHistoryMessages);
  typedIpcMain.handle("setSessionId", agentRuntime.setSessionId);

  return () => {
    typedIpcMain.removeAllListeners();
  };
}

export function bindAgentRuntimeIPC(
  agentRuntime: AgentRuntime,
  browserWindow: BrowserWindow,
): () => void {
  const unregisterAgentRuntimeHandlers = registerAgentRuntimeHandlers(agentRuntime, browserWindow);
  const unregisterIPCHandlers = registerIPCHandlers(agentRuntime);

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
