import type { RendererExtensionDefinition } from "./define.js";
import { RendererExtensionRegistry } from "./registry.js";

export class RendererExtensionBridge {
  private registry = new RendererExtensionRegistry();
  private initialized = false;

  constructor(private extensions: RendererExtensionDefinition[]) {}

  initialize() {
    if (this.initialized) return;

    for (const extension of this.extensions) {
      this.registry.registerExtension(extension);
      const metadata = { id: extension.id, name: extension.name };
      extension.setup({
        extension: metadata,
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
          registerRehypePlugins: (composer) =>
            this.registry.registerStreamdownRehypePlugins(composer),
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
