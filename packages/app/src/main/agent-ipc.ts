import { readFile } from "node:fs/promises";

import { BrowserWindow, ipcMain } from "electron";

import type { AgentRuntimeIPC } from "../shared/events-ipc.js";
import { ALLOWED_AGENT_EXPOSE_EVENTS } from "../shared/events-ipc.js";
import type { AgentPool } from "./agent-pool.js";
import type { WindowManager } from "./window-manager.js";

type AgentChannel = keyof AgentRuntimeIPC;

export function bindAgentRuntimeIPC(
  agentPool: AgentPool,
  windowManager: WindowManager,
): () => void {
  const sessionOwners = new Map<string, number>();
  const registeredChannels: AgentChannel[] = [];

  const handle = <C extends AgentChannel>(
    channel: C,
    listener: (...args: Parameters<AgentRuntimeIPC[C]>) => ReturnType<AgentRuntimeIPC[C]>,
  ) => {
    ipcMain.handle(channel, (_event, ...args) =>
      listener(...(args as Parameters<AgentRuntimeIPC[C]>)),
    );
    registeredChannels.push(channel);
  };

  const handleOwnedSession = <C extends AgentChannel>(
    channel: C,
    listener: (...args: Parameters<AgentRuntimeIPC[C]>) => ReturnType<AgentRuntimeIPC[C]>,
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      const sessionId = args[0];
      if (typeof sessionId === "string") {
        sessionOwners.set(sessionId, event.sender.id);
      }
      return listener(...(args as Parameters<AgentRuntimeIPC[C]>));
    });
    registeredChannels.push(channel);
  };

  handleOwnedSession("setModel", agentPool.setModel);
  handle("getAvailableModels", agentPool.getAvailableModels);
  handle("getModelConfig", agentPool.getModelConfig);
  handle("saveModelConfig", agentPool.saveModelConfig);
  handleOwnedSession("prompt", agentPool.prompt);
  handle("runOneTimeAgent", agentPool.runOneTimeAgent);
  handleOwnedSession("abortPrompt", agentPool.abortPrompt);
  handleOwnedSession("clearAllQueues", agentPool.clearAllQueues);
  handleOwnedSession("setHistoryMessages", agentPool.setHistoryMessages);
  handle("getSessionRuntimeSnapshot", agentPool.getSessionRuntimeSnapshot);
  handleOwnedSession("setSessionId", agentPool.setSessionId);
  handleOwnedSession("setSessionScope", agentPool.setSessionScope);
  handleOwnedSession("destroySession", async (sessionId) => {
    sessionOwners.delete(sessionId);
    return agentPool.destroySession(sessionId);
  });
  handleOwnedSession("setPermissionMode", agentPool.setPermissionMode);
  handleOwnedSession("resolvePermissionRequest", agentPool.resolvePermissionRequest);
  handle("listSkills", agentPool.listSkills);
  handle("setSkillEnabled", agentPool.setSkillEnabled);
  handle("fsReadTextFile", handleFsReadTextFile);

  ipcMain.handle("isWindowFullScreen", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });
  registeredChannels.push("isWindowFullScreen");

  ipcMain.handle("getWindowKind", (event) => windowManager.getWindowKind(event.sender));
  registeredChannels.push("getWindowKind");
  ipcMain.handle("hideCompanionWindow", () => windowManager.hideCompanionWindow());
  registeredChannels.push("hideCompanionWindow");
  ipcMain.handle("openSessionInMainWindow", (_event, sessionId: string) => {
    windowManager.openSessionInMainWindow(sessionId);
  });
  registeredChannels.push("openSessionInMainWindow");

  const offAny = agentPool.onAny(({ name, data }) => {
    if (typeof name !== "string" || !ALLOWED_AGENT_EXPOSE_EVENTS.includes(name as never)) {
      return;
    }

    const sessionId = isRecord(data) && typeof data.sessionId === "string" ? data.sessionId : null;
    const ownerId = sessionId ? sessionOwners.get(sessionId) : undefined;
    const owner = ownerId
      ? windowManager.getWindows().find((window) => window.webContents.id === ownerId)
      : undefined;
    const targets = owner ? [owner] : windowManager.getWindows();

    for (const window of targets) {
      window.webContents.send(name, data);
    }
  });

  return () => {
    offAny();
    for (const channel of registeredChannels) {
      ipcMain.removeHandler(channel);
    }
  };
}

async function handleFsReadTextFile(
  path: string,
): Promise<{ content: string; bytes: number } | { error: string }> {
  try {
    const content = await readFile(path, "utf-8");
    return { content, bytes: Buffer.byteLength(content, "utf-8") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
