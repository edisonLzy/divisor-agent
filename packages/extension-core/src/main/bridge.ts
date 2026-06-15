import type { ExtensionManifest } from "../manifest.js";
import type { MainExtensionDefinition, MainExtensionRuntimeAPI } from "./define";
import { MainExtensionRegistry } from "./registry";

export interface InstalledMainExtension {
  manifest: ExtensionManifest;
  extension: MainExtensionDefinition;
}

export interface MainExtensionBridgeServices {
  runtime?: MainExtensionRuntimeAPI;
}

export class MainExtensionBridge {
  private registry = new MainExtensionRegistry();
  private initialized = false;

  constructor(
    private extensions: InstalledMainExtension[],
    private services: MainExtensionBridgeServices = {},
  ) {}

  initialize() {
    if (this.initialized) {
      return;
    }

    for (const item of this.extensions) {
      this.registry.registerExtension(item.manifest);
      item.extension.setup({
        manifest: item.manifest,
        runtime: this.services.runtime ?? createUnavailableRuntimeAPI(),
        systemPrompt: {
          register: (prompt) => this.registry.registerSystemPrompt(item.manifest, prompt),
        },
        tools: {
          register: (tool) => this.registry.registerTool(tool),
        },
      });
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
