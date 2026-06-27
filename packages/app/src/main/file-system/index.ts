import { readFile } from "node:fs/promises";

import type { BrowserWindow } from "electron";

import type { FileSystemIPC } from "../../shared/file-system-ipc";
import { createTypedIpcMain } from "../helper.js";
import { AgentEventsBinder } from "../types";

/**
 * Main-process counterpart of `FileSystemIPC`. Currently the only consumer is
 * the `extension-files` package, which lazy-loads file contents when the user
 * clicks a `file://` link in an assistant message.
 *
 * FileSystem does not extend Emittery — it does not push any events to the
 * renderer — but it still implements `AgentEventsBinder` so `index.ts` can
 * wire it up through the same `bindEvents(window)` entry point.
 */
export class FileSystem implements FileSystemIPC, AgentEventsBinder {
  public fsReadTextFile: FileSystemIPC["fsReadTextFile"] = async (path) => {
    try {
      const content = await readFile(path, "utf-8");
      return { content, bytes: Buffer.byteLength(content, "utf-8") };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  /**
   * Register the `fsReadTextFile` IPC handler on a typed ipcMain instance
   * scoped to FileSystem's IPC contract.
   *
   * `_browserWindow` is unused today but kept in the signature so all
   * `AgentEventsBinder` implementations share a uniform call site in
   * `index.ts`.
   */
  bindEvents(_browserWindow: BrowserWindow): () => void {
    const typedFsIPC = createTypedIpcMain<FileSystemIPC>();
    typedFsIPC.handle("fsReadTextFile", this.fsReadTextFile);

    return () => {
      typedFsIPC.removeAllListeners();
    };
  }
}
