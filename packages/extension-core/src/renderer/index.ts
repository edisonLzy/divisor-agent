export { RendererExtensionBridge } from "./bridge.js";
export { defineRendererExtension } from "./define.js";
export { useArtifact, useAssistantBlock, useExtensions, usePluginSlashCommands } from "./hooks.js";
export { parseExtensionParts } from "./parser.js";
export { ExtensionProvider, useExtensionRegistry } from "./provider.js";
export { RendererExtensionRegistry } from "./registry.js";

export type { InstalledRendererExtension } from "./bridge.js";
export type {
  ArtifactRegistration,
  ArtifactRenderProps,
  AssistantBlockRegistration,
  AssistantBlockRenderProps,
  RendererExtensionContext,
  RendererExtensionDefinition,
  RendererSlashCommand,
  RendererSlashCommandRunContext,
} from "./define.js";
export type { ParsedExtensionPart } from "./parser.js";
