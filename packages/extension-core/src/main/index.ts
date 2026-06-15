export { MainExtensionBridge } from "./bridge";
export { defineMainExtension } from "./define";
export { MainExtensionRegistry } from "./registry";

export type { InstalledMainExtension, MainExtensionBridgeServices } from "./bridge";
export type {
  CreateExtensionAgentInput,
  ExtensionCurrentAgentContext,
  ExtensionAgentEvent,
  ExtensionAgentHandle,
  ExtensionAgentModel,
  ExtensionAgentToolOptions,
  MainExtensionContext,
  MainExtensionDefinition,
  MainExtensionRuntimeAPI,
  MainSystemPromptRegistration,
} from "./define";
