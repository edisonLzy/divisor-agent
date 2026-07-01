import type { ExtensionDisposer } from "../common/ipc/index.js";
import type { AnyMainExtensionDefinition, HostMainExtensionContextValues } from "./define.js";
import { MainExtensionIPC } from "./ipc.js";
import { MainExtensionRegistry } from "./registry.js";

export class MainExtensionBridge {
  private disposers: ExtensionDisposer[] = [];
  private ipcInstances: MainExtensionIPC<any, any>[] = [];
  private initialized = false;
  private registry = new MainExtensionRegistry();

  constructor(
    private extensions: AnyMainExtensionDefinition[],
    private hostContextValues: HostMainExtensionContextValues,
  ) {}

  initialize() {
    if (this.initialized) return;

    for (const extension of this.extensions) {
      this.registry.registerExtension(extension);
      const ipc = new MainExtensionIPC(extension.id, this.hostContextValues);
      this.ipcInstances.push(ipc);
      const disposer = extension.setup({
        ...this.hostContextValues,
        ipc,
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
    for (const ipc of this.ipcInstances) {
      ipc.dispose();
    }
    this.ipcInstances = [];
    this.registry.dispose();
    this.initialized = false;
  }
}
