import type { BrowserWindow } from "electron";

import type { ExtensionDisposer, ExtensionIPCEventEnvelope } from "../common/ipc/index.js";
import type { AnyMainExtensionDefinition, MainExtensionRuntimeAPI } from "./define.js";
import { MainExtensionRegistry } from "./registry.js";
import type { UntypedExtensionIPCHandler } from "./registry.js";

export interface MainExtensionBridgeServices {
  emitIPCEvent?: (envelope: ExtensionIPCEventEnvelope) => void;
  getBrowserWindow?: () => BrowserWindow | null;
  runtime?: MainExtensionRuntimeAPI;
}

export class MainExtensionBridge {
  private disposers: ExtensionDisposer[] = [];
  private initialized = false;
  private registry = new MainExtensionRegistry();

  constructor(
    private extensions: AnyMainExtensionDefinition[],
    private services: MainExtensionBridgeServices = {},
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
        getBrowserWindow: this.services.getBrowserWindow ?? (() => null),
        ipc: {
          emit: (event, ...args) => {
            this.services.emitIPCEvent?.({
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
        runtime: this.services.runtime ?? createUnavailableRuntimeAPI(),
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

function createUnavailableRuntimeAPI(): MainExtensionRuntimeAPI {
  const reject = () => {
    throw new Error("Main extension runtime API is not available");
  };

  return {
    abortAgent: reject,
    createAgent: reject,
    destroyAgent: reject,
    getCurrentAgentContext: reject,
    promptAgent: reject,
    subscribeAgentEvents: reject,
  };
}
