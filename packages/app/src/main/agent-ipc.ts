import { readFile } from "node:fs/promises";

import {
  EXTENSION_INVOKE_CHANNEL,
  type ExtensionIPCInvokeRequest,
} from "@divisor-agent/extension-core/common";
import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";

import type { FileSystemIPC } from "../shared/file-system-ipc";
import type { AgentModelsIPC } from "../shared/models-ipc";
import type { AgentSessionIPC } from "../shared/session-ipc";
import type { AgentSkillsIPC } from "../shared/skills-ipc";
import type { SystemIPC } from "../shared/system-ipc";
import type { AgentPool } from "./agent-pool";

type BrowserWindowGetter = () => BrowserWindow | null;

function registerAgentRuntimeHandlers(agentPool: AgentPool, getBrowserWindow: BrowserWindowGetter) {
  const offAny = agentPool.onAny(({ name, data }) => {
    const browserWindow = getBrowserWindow();
    if (
      !browserWindow ||
      browserWindow.isDestroyed() ||
      browserWindow.webContents.isDestroyed() ||
      typeof name !== "string"
    ) {
      return;
    }

    browserWindow.webContents.send(name, data);
  });

  return () => {
    offAny();
  };
}

function registerIPCHandlers(agentPool: AgentPool, getBrowserWindow: BrowserWindowGetter) {
  const typedIpcMain = createTypedIpcMain();

  typedIpcMain.handle("setModel", agentPool.setModel);
  typedIpcMain.handle("getAvailableModels", agentPool.getAvailableModels);
  typedIpcMain.handle("getModelConfig", agentPool.getModelConfig);
  typedIpcMain.handle("saveModelConfig", agentPool.saveModelConfig);
  typedIpcMain.handle("prompt", agentPool.prompt);
  typedIpcMain.handle("runOneTimeAgent", agentPool.runOneTimeAgent);
  typedIpcMain.handle("abortPrompt", agentPool.abortPrompt);
  typedIpcMain.handle("setHistoryMessages", agentPool.setHistoryMessages);
  typedIpcMain.handle("setSessionId", agentPool.setSessionId);
  typedIpcMain.handle("setSessionScope", agentPool.setSessionScope);
  typedIpcMain.handle("destroySession", agentPool.destroySession);
  typedIpcMain.handle("setPermissionMode", agentPool.setPermissionMode);
  typedIpcMain.handle("resolvePermissionRequest", agentPool.resolvePermissionRequest);
  typedIpcMain.handle("listSkills", agentPool.listSkills);
  typedIpcMain.handle("setSkillEnabled", agentPool.setSkillEnabled);
  typedIpcMain.handle("fsReadTextFile", handleFsReadTextFile);
  typedIpcMain.handle(
    "isWindowFullScreen",
    async () => getBrowserWindow()?.isFullScreen() ?? false,
  );
  ipcMain.handle(EXTENSION_INVOKE_CHANNEL, (_event, input: unknown) => {
    const request = parseExtensionIPCRequest(input);
    return agentPool.invokeExtensionIPC(request.extensionId, request.method, request.args);
  });

  return () => {
    typedIpcMain.removeAllListeners();
    ipcMain.removeHandler(EXTENSION_INVOKE_CHANNEL);
  };
}

async function handleFsReadTextFile(
  path: string,
): Promise<{ content: string; bytes: number } | { error: string }> {
  try {
    const content = await readFile(path, "utf-8");
    return { content, bytes: Buffer.byteLength(content, "utf-8") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function bindAgentRuntimeIPC(
  agentPool: AgentPool,
  getBrowserWindow: BrowserWindowGetter,
): () => void {
  const unregisterAgentRuntimeHandlers = registerAgentRuntimeHandlers(agentPool, getBrowserWindow);
  const unregisterIPCHandlers = registerIPCHandlers(agentPool, getBrowserWindow);

  return () => {
    // Unbind logic here
    unregisterAgentRuntimeHandlers();
    unregisterIPCHandlers();
  };
}

function parseExtensionIPCRequest(input: unknown): ExtensionIPCInvokeRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid extension IPC request");
  }

  const request = input as Partial<ExtensionIPCInvokeRequest>;
  if (
    typeof request.extensionId !== "string" ||
    !request.extensionId.trim() ||
    typeof request.method !== "string" ||
    !request.method.trim() ||
    !Array.isArray(request.args)
  ) {
    throw new Error("Invalid extension IPC request");
  }

  return {
    args: request.args,
    extensionId: request.extensionId,
    method: request.method,
  };
}

function createTypedIpcMain() {
  type AgentIPC = AgentModelsIPC & AgentSessionIPC & AgentSkillsIPC & FileSystemIPC & SystemIPC;
  return {
    ...ipcMain,
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as unknown as string, (_, ...params) => {
        return (listener as any)(...params);
      });
    },
  };
}
