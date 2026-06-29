import type { BrowserWindow } from "electron";

import { EXTENSION_EVENT_CHANNEL } from "../common/ipc/index.js";
import type { ExtensionDisposer } from "../common/ipc/index.js";
import type { AnyMainExtensionDefinition, MainExtensionRuntimeAPI } from "./define.js";
import { MainExtensionRegistry } from "./registry.js";
import type { UntypedExtensionIPCHandler } from "./registry.js";

export interface MainExtensionContextValues<
  TAgentRuntime extends MainExtensionRuntimeAPI = MainExtensionRuntimeAPI,
> {
  getBrowserWindow(): BrowserWindow | null;
  agentRuntime: TAgentRuntime;
}

export class MainExtensionBridge {
  private disposers: ExtensionDisposer[] = [];
  private initialized = false;
  private registry = new MainExtensionRegistry();

  constructor(
    private extensions: AnyMainExtensionDefinition[],
    private contextValues: MainExtensionContextValues,
  ) {}

  initialize() {
    if (this.initialized) return;

    for (const extension of this.extensions) {
      this.registry.registerExtension(extension);
      const metadata = { id: extension.id, name: extension.name };
      const disposer = extension.setup({
        agent: {
          on: (_event, listener) => this.registry.onSessionDestroyed(listener),
        },
        extension: metadata,
        getBrowserWindow: this.contextValues.getBrowserWindow,
        ipc: {
          emit: (event, ...args) => {
            const browserWindow = this.contextValues.getBrowserWindow();
            if (
              !browserWindow ||
              browserWindow.isDestroyed() ||
              browserWindow.webContents.isDestroyed()
            ) {
              return;
            }

            browserWindow.webContents.send(EXTENSION_EVENT_CHANNEL, {
              args,
              event,
              extensionId: extension.id,
            });
          },
          handle: (method, handler) =>
            this.registry.registerIPCHandler(
              extension.id,
              method,
              handler as UntypedExtensionIPCHandler,
            ),
        },
        runtime: this.contextValues.agentRuntime,
        systemPrompt: {
          register: (prompt) => this.registry.registerSystemPrompt(extension, prompt),
        },
        tools: {
          register: (tool) => this.registry.registerTool(tool),
        },
      });
      if (disposer) this.disposers.push(disposer);
    }

    this.initialized = true;
  }

  invokeIPC(extensionId: string, method: string, args: unknown[]) {
    return this.registry.invokeIPC(extensionId, method, args);
  }

  emitSessionDestroyed(sessionId: string) {
    return this.registry.emitSessionDestroyed(sessionId);
  }

  listExtensions() {
    return this.registry.listExtensions();
  }

  getSystemPrompts() {
    return this.registry.getSystemPrompts();
  }

  getTools() {
    return this.registry.getTools();
  }

  dispose() {
    for (const disposer of this.disposers.reverse()) {
      try {
        disposer();
      } catch (error) {
        console.error("Failed to dispose main extension", error);
      }
    }
    this.disposers = [];
    this.registry.dispose();
    this.initialized = false;
  }
}
