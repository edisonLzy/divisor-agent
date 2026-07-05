import { beforeEach, describe, expect, it, vi } from "vitest";

const { createdViews, sessionMock } = vi.hoisted(() => ({
  createdViews: [] as any[],
  sessionMock: {
    cookies: { flushStore: vi.fn(), set: vi.fn() },
    fetch: vi.fn(),
    listenerCount: vi.fn(() => 1),
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  },
}));

vi.mock("electron", () => {
  class FakeContents {
    private listeners = new Map<string, Array<(...args: any[]) => void>>();
    debugger = {
      attach: vi.fn(),
      isAttached: vi.fn(() => false),
      sendCommand: vi.fn(),
    };
    navigationHistory = {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    capturePage = vi.fn();
    close = vi.fn(() => this.emit("destroyed"));
    getTitle = vi.fn(() => "Example");
    getURL = vi.fn(() => "https://example.com/");
    isDestroyed = vi.fn(() => false);
    isLoading = vi.fn(() => false);
    loadURL = vi.fn(async () => undefined);
    reload = vi.fn();
    setWindowOpenHandler = vi.fn();

    emit(name: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(name) ?? []) listener(...args);
    }

    on(name: string, listener: (...args: any[]) => void) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
      return this;
    }
  }
  class FakeView {
    setBounds = vi.fn();
    webContents = new FakeContents();
    constructor() {
      createdViews.push(this);
    }
  }
  return {
    app: { getPath: vi.fn(() => "/path/that/does/not/exist") },
    dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn() },
    safeStorage: { decryptString: vi.fn() },
    session: { fromPartition: vi.fn(() => sessionMock) },
    shell: { openExternal: vi.fn() },
    WebContentsView: FakeView,
  };
});

import { BrowserManager } from "../src/main/browser-manager";

describe("BrowserManager", () => {
  beforeEach(() => {
    createdViews.length = 0;
    vi.clearAllMocks();
    sessionMock.listenerCount.mockReturnValue(1);
  });

  it("owns views in main and attaches only the selected surface", () => {
    const contentView = { addChildView: vi.fn(), removeChildView: vi.fn() };
    const browserWindow = {
      contentView,
      getContentBounds: vi.fn(() => ({ height: 800, width: 1200, x: 0, y: 0 })),
      isDestroyed: vi.fn(() => false),
      webContents: { getZoomFactor: vi.fn(() => 1.5) },
    };
    const manager = new BrowserManager(() => browserWindow as never, vi.fn());
    const tab = manager.createTab("session", "example.com");

    manager.setSurface({
      rect: { height: 200, width: 300, x: 10, y: 20 },
      sessionId: "session",
      tabId: tab.id,
      visible: true,
    });

    expect(contentView.addChildView).toHaveBeenCalledWith(createdViews[0]);
    expect(createdViews[0].setBounds).toHaveBeenCalledWith({
      height: 300,
      width: 450,
      x: 15,
      y: 30,
    });
    manager.setSurface({ sessionId: "session", visible: false });
    expect(contentView.removeChildView).toHaveBeenCalledWith(createdViews[0]);
  });

  it("isolates tabs by agent session", () => {
    const manager = new BrowserManager(() => null, vi.fn());
    const tab = manager.createTab("one", "https://example.com");
    expect(manager.getState("one").tabs).toHaveLength(1);
    expect(manager.getState("two").tabs).toHaveLength(0);
    expect(() => manager.setActiveTab("two", tab.id)).toThrowError(/unavailable/);
  });

  it("recreates a view after an unexpected window or renderer teardown", () => {
    const manager = new BrowserManager(() => null, vi.fn());
    const tab = manager.createTab("session", "https://example.com");
    createdViews[0].webContents.emit("destroyed");

    expect(createdViews).toHaveLength(2);
    expect(createdViews[1].webContents.loadURL).toHaveBeenCalledWith("https://example.com/");
    expect(manager.getState("session").tabs[0].id).toBe(tab.id);
  });
});
