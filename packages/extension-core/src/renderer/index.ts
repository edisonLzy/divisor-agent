export { RendererExtensionBridge } from "./bridge";
export { ExtensionsContextAPIProvider, useExtensionsContextAPI } from "./contextAPI";
export { defineRendererExtension } from "./define";
export {
  createExtensionIPC,
  useArtifact,
  useAssistantBlock,
  useExtensions,
  usePluginPromptInputExtensions,
  usePluginSlashCommands,
  useSharedPromptEditor,
} from "./hooks";
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
  TipTapExtensionRegistration,
} from "./define";
export type { RendererExtensionIPC } from "./ipc";
export type { ParsedExtensionPart } from "./parser";
export { SharedPromptEditor } from "./sharedPromptEditor";
