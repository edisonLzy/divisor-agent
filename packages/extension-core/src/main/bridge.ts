import type { ExtensionManifest } from "../manifest.js";
import type { MainExtensionDefinition } from "./define.js";
import { MainExtensionRegistry } from "./registry.js";

export interface InstalledMainExtension {
  manifest: ExtensionManifest;
  extension: MainExtensionDefinition;
}

export class MainExtensionBridge {
  private registry = new MainExtensionRegistry();
  private initialized = false;

  constructor(private extensions: InstalledMainExtension[]) {}

  initialize() {
    if (this.initialized) {
      return;
    }

    for (const item of this.extensions) {
      this.registry.registerExtension(item.manifest);
      item.extension.setup({
        manifest: item.manifest,
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
