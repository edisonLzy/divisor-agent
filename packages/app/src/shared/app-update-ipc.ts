export type AppUpdateState =
  | {
      status: "idle" | "checking" | "not-available";
      currentVersion: string;
    }
  | {
      status: "available";
      currentVersion: string;
      version: string;
      releaseName?: string;
      releaseDate?: string;
    }
  | {
      status: "downloading";
      currentVersion: string;
      version: string;
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | {
      status: "downloaded";
      currentVersion: string;
      version: string;
    }
  | {
      status: "error";
      currentVersion: string;
      version?: string;
      message: string;
    };

export type AppUpdateEvent = AppUpdateState & {
  type: "app_update";
};

export interface AppUpdateIPC {
  getUpdateState(): Promise<AppUpdateState>;
  checkForUpdates(): Promise<void>;
  startUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
}
