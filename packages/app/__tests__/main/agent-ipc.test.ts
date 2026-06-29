import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: any, ...args: any[]) => unknown>(),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: any, ...args: any[]) => unknown) => {
      ipcMocks.handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      ipcMocks.handlers.delete(channel);
    }),
  },
}));

import { bindAgentRuntimeIPC } from "../../src/main/agent-ipc.js";
import type { AgentPool } from "../../src/main/agent-pool.js";
import type { WindowManager } from "../../src/main/window-manager.js";

describe("bindAgentRuntimeIPC", () => {
  beforeEach(() => {
    ipcMocks.handlers.clear();
    vi.clearAllMocks();
  });

  it("routes session events only to the renderer that claimed the session", async () => {
    let emitAgentEvent: ((event: { name: string; data: unknown }) => void) | undefined;
    const agentPool = createAgentPool((listener) => {
      emitAgentEvent = listener;
      return vi.fn();
    });
    const ownerWindow = createWindow(12);
    const otherWindow = createWindow(24);
    const windowManager = {
      getWindows: () => [ownerWindow, otherWindow],
      getWindowKind: vi.fn(() => "main"),
      hideCompanionWindow: vi.fn(),
      openSessionInMainWindow: vi.fn(),
    } as unknown as WindowManager;

    const unbind = bindAgentRuntimeIPC(agentPool, windowManager);
    await ipcMocks.handlers.get("setSessionId")?.({ sender: { id: 12 } }, "session-1");
    emitAgentEvent?.({
      name: "agent_start",
      data: { scope: "main", sessionId: "session-1", type: "agent_start" },
    });

    expect(ownerWindow.webContents.send).toHaveBeenCalledWith("agent_start", {
      scope: "main",
      sessionId: "session-1",
      type: "agent_start",
    });
    expect(otherWindow.webContents.send).not.toHaveBeenCalled();

    unbind();
    expect(ipcMocks.handlers.size).toBe(0);
  });
});

function createAgentPool(
  onAny: (listener: (event: { name: string; data: unknown }) => void) => () => void,
) {
  const methods = new Proxy(
    { onAny: vi.fn(onAny) },
    {
      get(target, property) {
        if (property in target) {
          return target[property as keyof typeof target];
        }
        return vi.fn();
      },
    },
  );
  return methods as unknown as AgentPool;
}

function createWindow(id: number) {
  return {
    webContents: {
      id,
      send: vi.fn(),
    },
  };
}
