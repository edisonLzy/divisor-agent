export { RendererExtensionBridge } from "./bridge";
export { ExtensionsContextAPIProvider, useExtensionsContextAPI } from "./contextAPI";
export { defineRendererExtension } from "./define";
export { useArtifact, useAssistantBlock, useExtensions, usePluginSlashCommands } from "./hooks";
export { parseExtensionParts } from "./parser";
export { ExtensionProvider, useExtensionRegistry } from "./provider";
export { RendererExtensionRegistry } from "./registry";

export type {
  AppendSideChatMetaInput,
  ExtensionArtifactInput,
  ExtensionsContextAPI,
  ExtensionsContextAPIProviderProps,
  InsertSideChatUserMessageEntryInput,
} from "./contextAPI";
export type { InstalledRendererExtension } from "./bridge";
export type {
  ArtifactRegistration,
  ArtifactRenderProps,
  AssistantBlockRegistration,
  AssistantBlockRenderProps,
  RendererExtensionContext,
  RendererExtensionDefinition,
  RendererSlashCommand,
  RendererSlashCommandRunContext,
  StreamdownRehypePluginComposer,
  StreamdownRehypePlugins,
} from "./define";
export type { ParsedExtensionPart } from "./parser";
