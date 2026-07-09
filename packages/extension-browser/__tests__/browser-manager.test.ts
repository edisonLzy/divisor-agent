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
    const tab = manager.createTab("session", "https://example.com");

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
    const tab = manager.createTab("session", "https://example.com");

    manager.registerGuest({
      browserPageId: tab.id,
      sessionId: "session",
      profileId: "default",
      webContentsId: 1,
    });

    expect(fromIdMock).not.toHaveBeenCalled();
  });

  it("isolates tabs by agent session", () => {
    const manager = new BrowserManager(() => null, vi.fn());
    const tab = manager.createTab("one", "https://example.com");
    expect(manager.getState("one").tabs).toHaveLength(1);
    expect(manager.getState("two").tabs).toHaveLength(0);
    expect(() => manager.setActiveTab("two", tab.id)).toThrowError(/unavailable/);
  });

  it("returns comments captured by the in-page selection editor", async () => {
    const manager = new BrowserManager(() => null, vi.fn());
    const tab = manager.createTab("session", "https://example.com");
    const guest = new FakeContents();
    fromIdMock.mockReturnValue(guest);
    manager.registerGuest({
      browserPageId: tab.id,
      sessionId: "session",
      profileId: "default",
      webContentsId: guest.id,
    });

    const screenshot = { toDataURL: vi.fn(() => "data:image/png;base64,selected") };
    const payload = createGrabPayload();
    guest.executeJavaScript.mockResolvedValue({
      comment: "Make this clearer",
      kind: "selected",
      payload,
    });
    guest.capturePage.mockResolvedValue(screenshot);

    const result = await manager.startElementSelection("session", tab.id);
    const selectionScript = guest.executeJavaScript.mock.calls[0][0];

    expect(selectionScript).toContain("commentEditor");
    expect(selectionScript).toContain("添加评论");
    expect(selectionScript).toContain("detailPanel");
    expect(result.comment).toBe("Make this clearer");
    expect(result.screenshotDataUrl).toBe("data:image/png;base64,selected");
  });

  it("forwards annotation viewport events only for the active bridge token", async () => {
    const onAnnotationViewportEvent = vi.fn();
    const manager = new BrowserManager(() => null, vi.fn(), onAnnotationViewportEvent);
    const tab = manager.createTab("session", "https://example.com");
    const guest = new FakeContents();
    fromIdMock.mockReturnValue(guest);
    manager.registerGuest({
      browserPageId: tab.id,
      sessionId: "session",
      profileId: "default",
      webContentsId: guest.id,
    });

    await manager.setAnnotationViewportBridge(
      tab.id,
      true,
      [
        {
          comment: "Original",
          computedStyles: {
            backgroundColor: "",
            border: "",
            borderRadius: "",
            color: "",
            display: "",
            fontFamily: "",
            fontSize: "",
            fontWeight: "",
            height: "",
            lineHeight: "",
            margin: "",
            padding: "",
            position: "",
            textAlign: "",
            width: "",
            zIndex: "",
          },
          id: "marker-1",
          index: 0,
          intent: "change",
          isFixed: false,
          tagName: "div",
          rectPage: { height: 20, width: 30, x: 1, y: 2 },
          rectViewport: { height: 20, width: 30, x: 1, y: 2 },
        },
      ],
      "token",
    );

    guest.emit(
      "console-message",
      {},
      1,
      '__divisor_annotation_viewport__:wrong:{"type":"save","markerId":"marker-1","comment":"Ignored"}',
    );
    guest.emit(
      "console-message",
      {},
      1,
      '__divisor_annotation_viewport__:token:{"type":"save","markerId":"marker-1","comment":"Updated"}',
    );

    expect(onAnnotationViewportEvent).toHaveBeenCalledTimes(1);
    expect(onAnnotationViewportEvent).toHaveBeenCalledWith({
      browserPageId: tab.id,
      comment: "Updated",
      markerId: "marker-1",
      type: "save",
    });
  });
});

function createGrabPayload() {
  return {
    ancestorPath: [],
    nearbyText: [],
    page: {
      capturedAt: new Date().toISOString(),
      devicePixelRatio: 1,
      sanitizedUrl: "https://example.com/",
      scrollX: 0,
      scrollY: 0,
      title: "Example",
      viewportHeight: 800,
      viewportWidth: 1200,
    },
    screenshot: null,
    target: {
      accessibility: {
        accessibleName: "Example button",
        ariaLabel: null,
        ariaLabelledBy: null,
        role: "button",
      },
      attributes: {},
      computedStyles: {
        backgroundColor: "rgba(0, 0, 0, 0)",
        border: "",
        borderRadius: "",
        color: "rgb(20, 17, 17)",
        display: "block",
        fontFamily: "Arial",
        fontSize: "14px",
        fontWeight: "400",
        height: "20px",
        lineHeight: "20px",
        margin: "",
        padding: "",
        position: "static",
        textAlign: "left",
        width: "120px",
        zIndex: "auto",
      },
      cssClasses: "",
      elementPath: "main > button",
      fullPath: "body > main > button",
      htmlSnippet: "<button>Example</button>",
      isFixed: false,
      nearbyElements: [],
      reactComponents: null,
      rectPage: { height: 20, width: 120, x: 10, y: 20 },
      rectViewport: { height: 20, width: 120, x: 10, y: 20 },
      selectedText: null,
      selector: "button",
      sourceFile: null,
      tagName: "button",
      textSnippet: "Example",
    },
  };
}
