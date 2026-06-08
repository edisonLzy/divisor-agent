import type { ExtensionManifest } from "../manifest.js";
import type {
  ArtifactRegistration,
  AssistantBlockRegistration,
  RendererSlashCommand,
} from "./define.js";

export class RendererExtensionRegistry {
  private extensions = new Map<string, ExtensionManifest>();
  private slashCommands: RendererSlashCommand[] = [];
  private assistantBlocks = new Map<string, AssistantBlockRegistration>();
  private artifacts = new Map<string, ArtifactRegistration>();

  registerExtension(manifest: ExtensionManifest) {
    this.extensions.set(manifest.id, manifest);
  }

  registerSlashCommand(command: RendererSlashCommand) {
    this.slashCommands.push(command);
  }

  registerAssistantBlock(block: AssistantBlockRegistration) {
    this.assistantBlocks.set(block.type, block);
  }

  registerArtifact(artifact: ArtifactRegistration) {
    this.artifacts.set(artifact.type, artifact);
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
}
