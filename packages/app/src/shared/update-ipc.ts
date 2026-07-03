export type UpdateState =
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
      message: string;
    };

export interface UpdateIPC {
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<void>;
  startUpdate(): Promise<void>;
}
