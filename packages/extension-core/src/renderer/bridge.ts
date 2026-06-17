import type { ExtensionManifest } from "../manifest.js";
import type { RendererExtensionDefinition } from "./define";
import { RendererExtensionRegistry } from "./registry";

export interface InstalledRendererExtension {
  manifest: ExtensionManifest;
  extension: RendererExtensionDefinition;
}

export class RendererExtensionBridge {
  private registry = new RendererExtensionRegistry();
  private initialized = false;

  constructor(private extensions: InstalledRendererExtension[]) {}

  initialize() {
    if (this.initialized) {
      return;
    }

    for (const item of this.extensions) {
      this.registry.registerExtension(item.manifest);
      item.extension.setup({
        manifest: item.manifest,
        slashCommands: {
          register: (command) => this.registry.registerSlashCommand(command),
        },
        assistantBlocks: {
          register: (block) => this.registry.registerAssistantBlock(block),
        },
        artifacts: {
          register: (artifact) => this.registry.registerArtifact(artifact),
        },
        streamdown: {
          registerComponents: (components) =>
            this.registry.registerStreamdownComponents(components),
        },
      });
    }

    this.initialized = true;
  }

  getRegistry() {
    return this.registry;
  }

  listExtensions() {
    return this.registry.listExtensions();
  }
}
