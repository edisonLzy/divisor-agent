import { readFile } from "node:fs/promises";

import { BrowserWindow, ipcMain } from "electron";

import type { BrowserArtifactIPC } from "../shared/browser-artifact-ipc";
import type { FileSystemIPC } from "../shared/file-system-ipc";
import type { AgentModelsIPC } from "../shared/models-ipc";
import type { AgentSessionIPC } from "../shared/session-ipc";
import type { AgentSkillsIPC } from "../shared/skills-ipc";
import type { SystemIPC } from "../shared/system-ipc";
import type { AgentPool } from "./agent-pool";
import { BrowserManager } from "./browser-manager.js";
import { BrowserSessionManager } from "./browser/browser-session-manager.js";
import {
  registerBrowserArtifact,
  unregisterBrowserArtifact,
} from "./browser/artifact-registry.js";
import { setBrowserSessionManager } from "./browser/ipc/register.js";

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
  browserWindow: BrowserWindow,
): () => void {
  // We register the agent event forwarder separately from the IPC handlers so
  // it can also tap into the BrowserManager that the IPC handlers create.
  // Sharing one BrowserManager between the two paths keeps the lifecycle tied
  // to a single instance.
  const typedIpcMain = createTypedIpcMain();
  const browserManager = new BrowserManager(browserWindow);
  const browserSessionManager = new BrowserSessionManager(browserManager, browserWindow);
  setBrowserSessionManager(browserSessionManager);

  const unregisterAgentRuntimeHandlers = registerAgentRuntimeHandlers(
    agentPool,
    browserManager,
    browserSessionManager,
    browserWindow,
  );
  const unregisterIPCHandlers = registerIPCHandlersWithManager(
    agentPool,
    browserManager,
    browserSessionManager,
    browserWindow,
    typedIpcMain,
  );

  return () => {
    // Unbind logic here
    unregisterAgentRuntimeHandlers();
    unregisterIPCHandlers();
  };
}

function registerAgentRuntimeHandlers(
  agentPool: AgentPool,
  browserManager: BrowserManager,
  browserSessionManager: BrowserSessionManager,
  browserWindow: BrowserWindow,
) {
  const offAgentAny = agentPool.onAny(({ name, data }) => {
    if (browserWindow.isDestroyed() || typeof name !== "string") {
      return;
    }

    browserWindow.webContents.send(name, data);
  });

  const offBrowserAny = browserManager.onAny(({ name, data }) => {
    if (browserWindow.isDestroyed() || typeof name !== "string") {
      return;
    }

    browserWindow.webContents.send(name, data);
  });

  const offBrowserSessionAny = browserSessionManager.onAny(({ name, data }) => {
    if (browserWindow.isDestroyed() || typeof name !== "string") {
      return;
    }

    browserWindow.webContents.send(name, data);
  });

  return () => {
    offAgentAny();
    offBrowserAny();
    offBrowserSessionAny();
  };
}

function registerIPCHandlersWithManager(
  agentPool: AgentPool,
  browserManager: BrowserManager,
  browserSessionManager: BrowserSessionManager,
  browserWindow: BrowserWindow,
  typedIpcMain: ReturnType<typeof createTypedIpcMain>,
): () => void {
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
  typedIpcMain.handle("destroySession", async (sessionId) => {
    await browserSessionManager.destroySession(sessionId);
    await browserManager.destroySession(sessionId);
    await agentPool.destroySession(sessionId);
  });
  typedIpcMain.handle("setPermissionMode", agentPool.setPermissionMode);
  typedIpcMain.handle("resolvePermissionRequest", agentPool.resolvePermissionRequest);
  typedIpcMain.handle("listSkills", agentPool.listSkills);
  typedIpcMain.handle("setSkillEnabled", agentPool.setSkillEnabled);
  typedIpcMain.handle("browserCreate", async (...args) => {
    try {
      return await browserManager.create(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserDestroy", browserManager.destroy.bind(browserManager));
  typedIpcMain.handle("browserSetBounds", async (...args) => {
    browserManager.setBounds(...args);
  });
  typedIpcMain.handle("browserNavigate", async (...args) => {
    try {
      return await browserManager.navigate(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserGoBack", async (...args) => {
    try {
      return await browserManager.goBack(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserGoForward", async (...args) => {
    try {
      return await browserManager.goForward(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserReload", async (...args) => {
    try {
      return await browserManager.reload(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserCaptureForAnnotation", async (...args) => {
    try {
      return await browserManager.captureForAnnotation(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserSetVisible", async (...args) => {
    browserManager.setVisible(...args);
  });

  // ── Phase A+: BrowserSessionManager handlers ───────────────────────────
  typedIpcMain.handle("browserSetMode", async (...args) => {
    try {
      await browserSessionManager.setMode(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserObserve", async (...args) => {
    try {
      return await browserSessionManager.observe(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserDispatch", async (...args) => {
    try {
      return await browserSessionManager.dispatch(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserOpenTab", async (...args) => {
    try {
      return await browserSessionManager.openTab(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserSwitchTab", async (...args) => {
    try {
      await browserSessionManager.switchTab(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserCloseTab", async (...args) => {
    try {
      await browserSessionManager.closeTab(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  typedIpcMain.handle("browserListTabs", async (...args) => {
    try {
      return await browserSessionManager.listTabs(...args);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ── Phase A: artifact → sessionId registry (renderer → main) ───────────
  typedIpcMain.handle("browserRegisterArtifact", (artifactId, sessionId) => {
    registerBrowserArtifact(artifactId, sessionId);
  });
  typedIpcMain.handle("browserUnregisterArtifact", (artifactId) => {
    unregisterBrowserArtifact(artifactId);
  });

  // ── Phase C: allow-list mutation ───────────────────────────────────────
  typedIpcMain.handle("browserUpdateAllowlist", async (patch) => {
    try {
      return await browserSessionManager.updateAllowlist(patch);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  typedIpcMain.handle("fsReadTextFile", handleFsReadTextFile);
  typedIpcMain.handle("isWindowFullScreen", async () => browserWindow.isFullScreen());

  return () => {
    typedIpcMain.removeAllListeners();
  };
}

function createTypedIpcMain() {
  type AgentIPC = AgentModelsIPC &
    AgentSessionIPC &
    AgentSkillsIPC &
    BrowserArtifactIPC &
    FileSystemIPC &
    SystemIPC;
  return {
    ...ipcMain,
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as unknown as string, (_, ...params) => {
        return (listener as any)(...params);
      });
    },
  };
}
