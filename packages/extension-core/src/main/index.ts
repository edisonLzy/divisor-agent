export { MainExtensionBridge } from "./bridge";
export { defineMainExtension } from "./define";
export { MainExtensionIPC } from "./ipc";
export { MainExtensionRegistry } from "./registry";

export type { UntypedExtensionIPCHandler } from "./ipc";
export type {
  AnyMainExtensionDefinition,
  CreateExtensionAgentInput,
  ExtensionCurrentAgentContext,
  ExtensionAgentEvent,
  ExtensionAgentHandle,
  ExtensionAgentModel,
  ExtensionAgentScope,
  ExtensionAgentToolOptions,
  HostMainExtensionContextValues,
  MainExtensionContext,
  MainExtensionDefinition,
  MainExtensionRuntimeAPI,
  MainSystemPromptRegistration,
} from "./define";
