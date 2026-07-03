import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { appMock, autoUpdaterMock, ipcMainMock } = vi.hoisted(() => {
  type Listener = (...args: any[]) => void;
  const listeners = new Map<string, Set<Listener>>();

  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => []),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return updater;
    }),
    off: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
      return updater;
    }),
    emit(event: string, ...args: any[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    reset() {
      listeners.clear();
      updater.checkForUpdates.mockReset();
      updater.downloadUpdate.mockReset();
      updater.quitAndInstall.mockReset();
      updater.checkForUpdates.mockResolvedValue(undefined);
      updater.downloadUpdate.mockResolvedValue([]);
    },
  };

  return {
    appMock: {
      isPackaged: true,
      getVersion: vi.fn(() => "1.0.0"),
    },
    autoUpdaterMock: updater,
    ipcMainMock: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    },
  };
});

vi.mock("electron", () => ({ app: appMock, ipcMain: ipcMainMock }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: autoUpdaterMock } }));

import { UpdateManager } from "../../../src/main/updater/index.js";

describe("UpdateManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    autoUpdaterMock.reset();
    ipcMainMock.handle.mockClear();
    ipcMainMock.removeHandler.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks for a release without downloading before user confirmation", async () => {
    const { manager, send } = createManager();
    autoUpdaterMock.checkForUpdates.mockImplementation(async () => {
      autoUpdaterMock.emit("update-available", {
        version: "1.0.2",
        releaseName: "Divisor Agent 1.0.2",
        releaseDate: "2026-07-03T00:00:00.000Z",
      });
      return undefined;
    });

    await manager.checkForUpdates();

    await expect(manager.getUpdateState()).resolves.toMatchObject({
      status: "available",
      currentVersion: "1.0.0",
      version: "1.0.2",
    });
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    expect(send).toHaveBeenLastCalledWith(
      "update_state",
      expect.objectContaining({ status: "available", version: "1.0.2" }),
    );
    manager.destroy();
  });

  it("downloads after confirmation and restarts after the update is ready", async () => {
    const { manager, send } = createManager();
    autoUpdaterMock.emit("update-available", { version: "1.0.3" });
    autoUpdaterMock.downloadUpdate.mockImplementation(async () => {
      autoUpdaterMock.emit("download-progress", {
        percent: 64.4,
        bytesPerSecond: 1_024,
        transferred: 644,
        total: 1_000,
      });
      autoUpdaterMock.emit("update-downloaded", { version: "1.0.3" });
      return [];
    });

    await manager.startUpdate();

    expect(send).toHaveBeenCalledWith(
      "update_state",
      expect.objectContaining({ status: "downloading", percent: 64.4 }),
    );
    await expect(manager.getUpdateState()).resolves.toMatchObject({
      status: "downloaded",
      version: "1.0.3",
    });
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(800);
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(false, true);
    manager.destroy();
  });
});

function createManager() {
  const send = vi.fn();
  const browserWindow = {
    isDestroyed: vi.fn(() => false),
    webContents: {
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      send,
    },
  };
  return { manager: new UpdateManager(browserWindow as never), send };
}
