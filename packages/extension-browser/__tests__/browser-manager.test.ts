import { beforeEach, describe, expect, it, vi } from "vitest";

const { createdContents, sessionMock, fromIdMock } = vi.hoisted(() => ({
  createdContents: [] as any[],
  sessionMock: {
    cookies: { flushStore: vi.fn(), set: vi.fn() },
    fetch: vi.fn(),
    listenerCount: vi.fn(() => 1),
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
  },
  fromIdMock: vi.fn(),
}));

vi.mock("electron", () => {
  let nextId = 100;
  class FakeContents {
    id: number;
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
    close = vi.fn();
    getTitle = vi.fn(() => "Example");
    getURL = vi.fn(() => "https://example.com/");
    isDestroyed = vi.fn(() => false);
    isLoading = vi.fn(() => false);
    executeJavaScript = vi.fn(async () => undefined);
    loadURL = vi.fn(async () => undefined);
    reload = vi.fn();
    setWindowOpenHandler = vi.fn();
    off = vi.fn((name: string, listener: (...args: any[]) => void) => {
      const arr = this.listeners.get(name);
      if (arr)
        this.listeners.set(
          name,
          arr.filter((l) => l !== listener),
        );
      return this;
    });

    constructor() {
      this.id = nextId++;
      createdContents.push(this);
    }

    emit(name: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(name) ?? []) listener(...args);
    }

    on(name: string, listener: (...args: any[]) => void) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
      return this;
    }
  }
  return {
    app: { getPath: vi.fn(() => "/path/that/does/not/exist") },
    dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn() },
    safeStorage: { decryptString: vi.fn() },
    session: { fromPartition: vi.fn(() => sessionMock) },
    shell: { openExternal: vi.fn() },
    webContents: { fromId: fromIdMock },
    // Exposed so tests can construct a guest the way a <webview> would.
    __FakeContents: FakeContents,
  };
});

import { BrowserManager } from "../src/main/browser-manager";

// Lazy accessor for the mock's FakeContents constructor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const electronMock = await import("electron");
const FakeContents = (electronMock as any).__FakeContents as { new (): any };
const openExternalMock = electronMock.shell.openExternal as ReturnType<typeof vi.fn>;

describe("BrowserManager", () => {
  beforeEach(() => {
    createdContents.length = 0;
    fromIdMock.mockReset();
    vi.clearAllMocks();
    sessionMock.listenerCount.mockReturnValue(1);
  });

  it("registers a renderer-owned guest and tracks it by webContentsId", () => {
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { id: 1 },
    };
    const manager = new BrowserManager(() => browserWindow as never, vi.fn());
    const tab = manager.ensurePage("session", "https://example.com");

    const guest = new FakeContents();
    fromIdMock.mockReturnValue(guest);
    manager.registerGuest({
      browserPageId: tab.id,
      sessionId: "session",
      profileId: "default",
      webContentsId: guest.id,
    });

    expect(fromIdMock).toHaveBeenCalledWith(guest.id);
    // Navigation state is read from the guest after registration.
    expect(guest.getTitle).toHaveBeenCalled();
  });

  it("rejects registering the host window's own webContents", () => {
    const browserWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { id: 1 },
    };
    const manager = new BrowserManager(() => browserWindow as never, vi.fn());
    const tab = manager.ensurePage("session", "https://example.com");

    manager.registerGuest({
      browserPageId: tab.id,
      sessionId: "session",
      profileId: "default",
      webContentsId: 1,
    });

    expect(fromIdMock).not.toHaveBeenCalled();
  });

  it("keeps one browser page isolated to its agent session", () => {
    const manager = new BrowserManager(() => null, vi.fn());
    const page = manager.ensurePage("one", "https://example.com");
    expect(manager.getState("one").tabs).toHaveLength(1);
    expect(manager.getState("two").tabs).toHaveLength(0);
    expect(() => manager.pageInfo("two", page.id)).toThrowError(/unavailable/);
  });

  it("reuses the session page when opening a new URL", () => {
    const manager = new BrowserManager(() => null, vi.fn());
    const page = manager.ensurePage("session", "https://example.com");
    const navigated = manager.openPage("session", "https://example.org");

    expect(navigated.id).toBe(page.id);
    expect(manager.getState("session").tabs).toEqual([
      expect.objectContaining({ id: page.id, url: "https://example.org/" }),
    ]);
  });

  it("opens the current page in the system browser only on explicit request", async () => {
    const manager = new BrowserManager(() => null, vi.fn());
    manager.ensurePage("session", "https://example.com");

    await manager.openInSystemBrowser("session");

    expect(openExternalMock).toHaveBeenCalledWith("https://example.com/");
  });
});
