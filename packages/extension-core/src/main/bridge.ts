import type { ExtensionDisposer } from "../common/ipc/index.js";
import type { AnyMainExtensionDefinition, HostMainExtensionContextValues } from "./define.js";
import { MainExtensionIPC } from "./ipc.js";
import { MainExtensionRegistry } from "./registry.js";

export class MainExtensionBridge {
  private disposers: ExtensionDisposer[] = [];
  private initialized = false;
  private registry = new MainExtensionRegistry();
  private ipc: MainExtensionIPC;

  constructor(
    private extensions: AnyMainExtensionDefinition[],
    private hostContextValues: HostMainExtensionContextValues,
  ) {
    this.ipc = new MainExtensionIPC(hostContextValues);
  }

  initialize() {
    if (this.initialized) return;

    for (const extension of this.extensions) {
      this.registry.registerExtension(extension);
      const disposer = extension.setup({
        ...this.hostContextValues,
        ipc: this.ipc,
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
    return this.ipc.invoke(extensionId, method, args);
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
    this.ipc.dispose();
    this.registry.dispose();
    this.initialized = false;
  }
}
