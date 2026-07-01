import { readFile } from "node:fs/promises";

import type { BrowserWindow } from "electron";

import type { FileSystemIPC } from "../../shared/file-system-ipc";
import { AbstractAgentIPCHandler } from "../agent-ipc";

export class FileSystemManager
  extends AbstractAgentIPCHandler<FileSystemIPC>
  implements FileSystemIPC
{
  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.unbind = this.bind();
  }

  fsReadTextFile = async (
    path: string,
  ): Promise<{ content: string; bytes: number } | { error: string }> => {
    try {
      const content = await readFile(path, "utf-8");
      return { content, bytes: Buffer.byteLength(content, "utf-8") };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  protected override bind(): VoidFunction {
    this.typedIpcMain.handle("fsReadTextFile", this.fsReadTextFile);
    return () => {
      this.typedIpcMain.removeHandler("fsReadTextFile");
    };
  }

  destroy() {
    this.unbind?.();
  }
}
