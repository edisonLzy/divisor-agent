import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
  const instances: MockWindow[] = [];
  const shortcut = { callback: undefined as (() => void) | undefined };

  class MockWindow {
    handlers = new Map<string, (...args: any[]) => void>();
    hidden = false;
    options: Record<string, unknown>;
    visible = false;
    webContents = {
      id: instances.length + 1,
      isLoading: vi.fn(() => false),
      once: vi.fn(),
      send: vi.fn(),
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
    }

    focus = vi.fn();
    getBounds = vi.fn(() => ({ x: 0, y: 0, width: 510, height: 660 }));
    hide = vi.fn(() => {
      this.hidden = true;
      this.visible = false;
    });
    isDestroyed = vi.fn(() => false);
    isVisible = vi.fn(() => this.visible);
    loadFile = vi.fn(async () => undefined);
    loadURL = vi.fn(async () => undefined);
    on = vi.fn((event: string, handler: (...args: any[]) => void) => {
      this.handlers.set(event, handler);
    });
    setAlwaysOnTop = vi.fn();
    setPosition = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    show = vi.fn(() => {
      this.visible = true;
    });
  }

  return { instances, MockWindow, shortcut };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMocks.MockWindow,
  globalShortcut: {
    register: vi.fn((_accelerator: string, callback: () => void) => {
      electronMocks.shortcut.callback = callback;
      return true;
    }),
    unregister: vi.fn(),
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    })),
  },
}));

import { globalShortcut } from "electron";

import { WindowManager } from "../../src/main/window-manager.js";

describe("WindowManager", () => {
  beforeEach(() => {
    electronMocks.instances.length = 0;
    electronMocks.shortcut.callback = undefined;
    vi.clearAllMocks();
  });

  it("creates a hidden always-on-top companion window at the bottom center", () => {
    const manager = new WindowManager();
    const companion = manager.createCompanionWindow() as unknown as InstanceType<
      typeof electronMocks.MockWindow
    >;

    expect(companion.options).toMatchObject({
      alwaysOnTop: true,
      frame: false,
      height: 660,
      show: false,
      skipTaskbar: true,
      transparent: true,
      width: 510,
    });
    expect(companion.setPosition).toHaveBeenCalledWith(465, 192);
    expect(companion.loadFile).toHaveBeenCalledWith(expect.any(String), {
      query: { window: "companion" },
    });
  });

  it("toggles and focuses the companion window from the global shortcut", () => {
    const manager = new WindowManager();
    const companion = manager.createCompanionWindow() as unknown as InstanceType<
      typeof electronMocks.MockWindow
    >;
    manager.registerShortcut();

    expect(globalShortcut.register).toHaveBeenCalledWith("Alt+Space", expect.any(Function));
    electronMocks.shortcut.callback?.();
    expect(companion.show).toHaveBeenCalledOnce();
    expect(companion.focus).toHaveBeenCalledOnce();
    expect(companion.webContents.send).toHaveBeenCalledWith("focus_companion_input", undefined);

    electronMocks.shortcut.callback?.();
    expect(companion.hide).toHaveBeenCalledOnce();
  });

  it("hides the companion close request without destroying the app", () => {
    const manager = new WindowManager();
    const companion = manager.createCompanionWindow() as unknown as InstanceType<
      typeof electronMocks.MockWindow
    >;
    const preventDefault = vi.fn();

    companion.handlers.get("close")?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(companion.hide).toHaveBeenCalledOnce();
  });
});
