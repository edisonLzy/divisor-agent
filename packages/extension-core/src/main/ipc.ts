import { ipcMain } from "electron";

import { EXTENSION_EVENT_CHANNEL, EXTENSION_INVOKE_CHANNEL } from "../common/ipc/constant.js";
import type {
  ExtensionDisposer,
  ExtensionIPCInvokeRequest,
  ExtensionIPCTransport,
} from "../common/ipc/types.js";
import type { HostMainExtensionContextValues } from "./define.js";

export type UntypedExtensionIPCHandler = (...args: any[]) => any;

/**
 * Singleton main-side IPC transport shared across all installed extensions.
 *
 * Implements {@link ExtensionIPCTransport} literally (`invoke` + `on`)
 * for cross-extension calls, and adds per-extension-scoped `handle` / `emit`
 * for registering handlers and pushing events to the renderer.
 */
export class MainExtensionIPC implements ExtensionIPCTransport {
  private handlers = new Map<string, Map<string, UntypedExtensionIPCHandler>>();
  private eventListeners = new Map<string, Map<string, Set<(...args: unknown[]) => void>>>();
  private unbind: VoidFunction | null = null;

  constructor(private readonly host: HostMainExtensionContextValues) {
    this.unbind = this.bind();
  }

  // ── ExtensionIPCTransport (cross-extension, extensionId explicit) ─────────

  invoke(extensionId: string, method: string, args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(extensionId)?.get(method);
    if (!handler) {
      throw new Error(`Extension IPC handler not found: ${extensionId}/${method}`);
    }
    return Promise.resolve(handler(...args));
  }

  on(
    extensionId: string,
    event: string,
    listener: (...args: unknown[]) => void,
  ): ExtensionDisposer {
    let listeners = this.eventListeners.get(extensionId);
    if (!listeners) {
      listeners = new Map();
      this.eventListeners.set(extensionId, listeners);
    }
    let bucket = listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      listeners.set(event, bucket);
    }
    bucket.add(listener);

    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        listeners.delete(event);
        if (listeners.size === 0) {
          this.eventListeners.delete(extensionId);
        }
      }
    };
  }

  // ── per-extension registration (bridge-layer, not in ExtensionIPCTransport) ──

  /** Register an IPC handler for an extension. Called by the bridge during setup. */
  handle(
    extensionId: string,
    method: string,
    handler: UntypedExtensionIPCHandler,
  ): ExtensionDisposer {
    let methods = this.handlers.get(extensionId);
    if (!methods) {
      methods = new Map();
      this.handlers.set(extensionId, methods);
    }
    if (methods.has(method)) {
      throw new Error(`Duplicate extension IPC handler: ${extensionId}/${method}`);
    }
    methods.set(method, handler);

    return () => {
      if (methods.get(method) === handler) {
        methods.delete(method);
        if (methods.size === 0) {
          this.handlers.delete(extensionId);
        }
      }
    };
  }

  /** Push an event from an extension to the renderer. Called by the bridge or extension setup. */
  emit(extensionId: string, event: string, ...args: unknown[]): void {
    const browserWindow = this.host.getBrowserWindow();
    if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
      return;
    }
    browserWindow.webContents.send(EXTENSION_EVENT_CHANNEL, { args, event, extensionId });
  }

  // ── ipcMain bridge ──────────────────────────────────────────────────────

  /**
   * Bind the `EXTENSION_INVOKE_CHANNEL` handler on the supplied `ipcMain`.
   * Returns an unbind function. Replaces the old `bindAgentRuntimeIPC`.
   */
  bind(): () => void {
    const listener = (_event: unknown, input: unknown) => {
      const req = parseInvokeRequest(input);
      const handler = this.handlers.get(req.extensionId)?.get(req.method);
      if (!handler) {
        throw new Error(`Extension IPC handler not found: ${req.extensionId}/${req.method}`);
      }
      return handler(...req.args);
    };
    ipcMain.handle(EXTENSION_INVOKE_CHANNEL, listener);
    return () => ipcMain.removeHandler(EXTENSION_INVOKE_CHANNEL);
  }

  /** Called by the bridge when it disposes. */
  dispose() {
    this.handlers.clear();
    this.eventListeners.clear();
    this.unbind?.();
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function parseInvokeRequest(input: unknown): ExtensionIPCInvokeRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid extension IPC request");
  }
  const req = input as Partial<ExtensionIPCInvokeRequest>;
  if (
    typeof req.extensionId !== "string" ||
    !req.extensionId.trim() ||
    typeof req.method !== "string" ||
    !req.method.trim() ||
    !Array.isArray(req.args)
  ) {
    throw new Error("Invalid extension IPC request");
  }
  return { args: req.args, extensionId: req.extensionId, method: req.method };
}
