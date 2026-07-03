import { app } from "electron";
import type { BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";

import type { AppUpdateIPC, AppUpdateState } from "../shared/app-update-ipc.js";
import { AbstractAgentIPCHandler } from "./agent-ipc.js";

const { autoUpdater } = electronUpdater;

export class AppUpdateManager
  extends AbstractAgentIPCHandler<AppUpdateIPC>
  implements AppUpdateIPC
{
  private state: AppUpdateState = {
    status: "idle",
    currentVersion: app.getVersion(),
  };

  private checkTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    this.bindUpdaterEvents();
    this.unbind = this.bind();

    if (app.isPackaged) {
      browserWindow.webContents.once("did-finish-load", () => {
        this.checkTimer = setTimeout(() => void this.checkForUpdates(), 2_000);
      });
    }
  }

  getUpdateState = async (): Promise<AppUpdateState> => this.state;

  checkForUpdates = async (): Promise<void> => {
    if (
      !app.isPackaged ||
      this.state.status === "checking" ||
      this.state.status === "downloading"
    ) {
      return;
    }

    this.setState({ status: "checking", currentVersion: app.getVersion() });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.handleError(error);
    }
  };

  startUpdate = async (): Promise<void> => {
    if (this.state.status !== "available") return;

    const version = this.state.version;
    this.setState({
      status: "downloading",
      currentVersion: app.getVersion(),
      version,
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
    });

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.handleError(error);
    }
  };

  installUpdate = async (): Promise<void> => {
    if (this.state.status !== "downloaded") return;
    autoUpdater.quitAndInstall(false, true);
  };

  destroy() {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    autoUpdater.off("checking-for-update", this.handleCheckingForUpdate);
    autoUpdater.off("update-available", this.handleUpdateAvailable);
    autoUpdater.off("update-not-available", this.handleUpdateNotAvailable);
    autoUpdater.off("download-progress", this.handleDownloadProgress);
    autoUpdater.off("update-downloaded", this.handleUpdateDownloaded);
    autoUpdater.off("error", this.handleError);
    this.unbind?.();
  }

  protected override bind(): VoidFunction {
    this.typedIpcMain.handle("getUpdateState", this.getUpdateState);
    this.typedIpcMain.handle("checkForUpdates", this.checkForUpdates);
    this.typedIpcMain.handle("startUpdate", this.startUpdate);
    this.typedIpcMain.handle("installUpdate", this.installUpdate);
    return () => {
      this.typedIpcMain.removeHandler("getUpdateState");
      this.typedIpcMain.removeHandler("checkForUpdates");
      this.typedIpcMain.removeHandler("startUpdate");
      this.typedIpcMain.removeHandler("installUpdate");
    };
  }

  private bindUpdaterEvents() {
    autoUpdater.on("checking-for-update", this.handleCheckingForUpdate);
    autoUpdater.on("update-available", this.handleUpdateAvailable);
    autoUpdater.on("update-not-available", this.handleUpdateNotAvailable);
    autoUpdater.on("download-progress", this.handleDownloadProgress);
    autoUpdater.on("update-downloaded", this.handleUpdateDownloaded);
    autoUpdater.on("error", this.handleError);
  }

  private handleCheckingForUpdate = () => {
    this.setState({ status: "checking", currentVersion: app.getVersion() });
  };

  private handleUpdateAvailable = (info: UpdateInfo) => {
    this.setState({
      status: "available",
      currentVersion: app.getVersion(),
      version: info.version,
      ...(info.releaseName ? { releaseName: info.releaseName } : {}),
      ...(info.releaseDate ? { releaseDate: info.releaseDate } : {}),
    });
  };

  private handleUpdateNotAvailable = () => {
    this.setState({ status: "not-available", currentVersion: app.getVersion() });
  };

  private handleDownloadProgress = (progress: ProgressInfo) => {
    const version =
      "version" in this.state ? (this.state.version ?? app.getVersion()) : app.getVersion();
    this.setState({
      status: "downloading",
      currentVersion: app.getVersion(),
      version,
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  };

  private handleUpdateDownloaded = (info: UpdateInfo) => {
    this.setState({
      status: "downloaded",
      currentVersion: app.getVersion(),
      version: info.version,
    });
  };

  private handleError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const version = "version" in this.state ? this.state.version : undefined;
    console.error("Application update failed:", error);
    this.setState({
      status: "error",
      currentVersion: app.getVersion(),
      ...(version ? { version } : {}),
      message,
    });
  };

  private setState(state: AppUpdateState) {
    this.state = state;
    this.sendMessageToRenderer("app_update", { ...state, type: "app_update" });
  }
}
