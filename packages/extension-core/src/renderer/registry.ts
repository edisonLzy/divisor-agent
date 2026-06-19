import type { Components as StreamdownComponents } from "streamdown";

import type { ExtensionManifest } from "../manifest.js";
import type {
  ArtifactRegistration,
  AssistantBlockRegistration,
  RendererSlashCommand,
  StreamdownComponent,
  StreamdownComponentComposerMap,
  StreamdownRehypePluginComposer,
  StreamdownRehypePlugins,
} from "./define";

type StreamdownComponentRegistration = {
  components: StreamdownComponentComposerMap;
};

export class RendererExtensionRegistry {
  private extensions = new Map<string, ExtensionManifest>();
  private slashCommands: RendererSlashCommand[] = [];
  private assistantBlocks = new Map<string, AssistantBlockRegistration>();
  private artifacts = new Map<string, ArtifactRegistration<any>>();
  private streamdownComponents: StreamdownComponentRegistration[] = [];
  private streamdownRehypePluginComposers: StreamdownRehypePluginComposer[] = [];

  registerExtension(manifest: ExtensionManifest) {
    this.extensions.set(manifest.id, manifest);
  }

  registerSlashCommand(command: RendererSlashCommand) {
    this.slashCommands.push(command);
  }

  registerAssistantBlock(block: AssistantBlockRegistration) {
    this.assistantBlocks.set(block.type, block);
  }

  registerArtifact<TContent = Record<string, unknown>>(artifact: ArtifactRegistration<TContent>) {
    this.artifacts.set(artifact.type, artifact);
  }

  registerStreamdownComponents(components: StreamdownComponentComposerMap) {
    this.streamdownComponents.push({ components });
  }

  registerStreamdownRehypePlugins(composer: StreamdownRehypePluginComposer) {
    this.streamdownRehypePluginComposers.push(composer);
  }

  listExtensions() {
    return Array.from(this.extensions.values());
  }

  getSlashCommands() {
    return [...this.slashCommands];
  }

  getAssistantBlock(type: string) {
    return this.assistantBlocks.get(type);
  }

  getArtifact(type: string) {
    return this.artifacts.get(type);
  }

  /**
   * Compose all registered Streamdown component overrides in registration
   * order. Each override receives the previous renderer and returns the next
   * one.
   */
  getStreamdownComponents(): Partial<StreamdownComponents> {
    const components: Record<string, StreamdownComponent> = {};

    for (const registration of this.streamdownComponents) {
      for (const [key, compose] of Object.entries(registration.components)) {
        if (!compose) continue;
        const previous = components[key] ?? getDefaultStreamdownComponent(key);
        components[key] = compose(previous);
      }
    }

    return components as Partial<StreamdownComponents>;
  }

  getStreamdownRehypePlugins(basePlugins: StreamdownRehypePlugins): StreamdownRehypePlugins {
    return this.streamdownRehypePluginComposers.reduce(
      (plugins, compose) => compose(plugins),
      basePlugins,
    );
  }
}

function getDefaultStreamdownComponent(key: string): StreamdownComponent {
  return (key === "inlineCode" ? "code" : key) as StreamdownComponent;
}
