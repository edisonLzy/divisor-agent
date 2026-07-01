import { ipcMain } from "electron";

import { extensionEventChannel, extensionInvokeChannel } from "../common/ipc/constant.js";
import type {
  ExtensionDisposer,
  ExtensionIPCArgs,
  ExtensionIPCKey,
  ExtensionIPCResult,
} from "../common/ipc/types.js";
import type { HostMainExtensionContextValues } from "./define.js";

/**
 * Per-extension IPC instance.
 *
 * Each extension gets its own instance with {@link extensionId} captured
 * at construction time — {@link handle} and {@link emit} do not require
 * the caller to pass it again.
 */
export class MainExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents> {
  private registeredChannels = new Set<string>();

  constructor(
    private extensionId: string,
    private host: HostMainExtensionContextValues,
  ) {}

  handle<C extends ExtensionIPCKey<AllowedRenderInvokeEvents>>(
    method: C,
    handler: (
      ...args: ExtensionIPCArgs<AllowedRenderInvokeEvents, C>
    ) => ExtensionIPCResult<AllowedRenderInvokeEvents, C>,
  ): ExtensionDisposer {
    const channel = extensionInvokeChannel(this.extensionId, method as string);
    if (this.registeredChannels.has(channel)) {
      throw new Error(`Duplicate extension IPC handler: ${channel}`);
    }
    this.registeredChannels.add(channel);
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      handler(...(args as Parameters<typeof handler>)),
    );
    return () => {
      this.registeredChannels.delete(channel);
      ipcMain.removeHandler(channel);
    };
  }

  emit<E extends ExtensionIPCKey<AllowedMainExposeEvents>>(
    event: E,
    ...args: ExtensionIPCArgs<AllowedMainExposeEvents, E>
  ): void {
    const browserWindow = this.host.getBrowserWindow();
    if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
      return;
    }
    browserWindow.webContents.send(
      extensionEventChannel(this.extensionId, event as string),
      ...args,
    );
  }

  dispose() {
    for (const channel of this.registeredChannels) {
      ipcMain.removeHandler(channel);
    }
    this.registeredChannels.clear();
  }
}
