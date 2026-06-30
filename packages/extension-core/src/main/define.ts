import type { AgentEvent, AgentTool, AppUserMessage } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import type { BrowserWindow } from "electron";

import type { ExtensionDisposer, ExtensionMetadata } from "../common/ipc/index.js";
import type { MainExtensionIPC } from "./ipc.js";

export interface MainSystemPromptRegistration {
  id: string;
  content: string | (() => string);
}

export interface ExtensionAgentModel {
  modelId: string;
  providerId: string;
}

export interface ExtensionAgentToolOptions {
  excludeToolNames?: string[];
  includeBuiltins?: boolean;
  includeExtensions?: boolean;
}

export type ExtensionAgentScope = "main" | "side-chat";

export interface CreateExtensionAgentInput {
  id?: string;
  label?: string;
  mode?: "inherit-model" | "isolated";
  model?: ExtensionAgentModel;
  scope?: ExtensionAgentScope;
  systemPrompt?: string;
  tools?: ExtensionAgentToolOptions;
}

export interface ExtensionAgentHandle {
  id: string;
  sessionId: string;
}

export interface ExtensionCurrentAgentContext {
  model?: ExtensionAgentModel;
  sessionId?: string;
}

export type ExtensionAgentEvent = AgentEvent;

export interface MainExtensionRuntimeAPI {
  abortAgent(agentId: string): Promise<void>;
  createAgent(input?: CreateExtensionAgentInput): Promise<ExtensionAgentHandle>;
  destroyAgent(agentId: string): Promise<void>;
  getCurrentAgentContext(): ExtensionCurrentAgentContext | undefined;
  promptAgent(agentId: string, message: AppUserMessage): Promise<void>;
  subscribeAgentEvents(
    agentId: string,
    listener: (event: ExtensionAgentEvent) => void | Promise<void>,
  ): () => void;
}

export interface HostMainExtensionContextValues {
  getBrowserWindow(): BrowserWindow | null;
  extensionRuntime: MainExtensionRuntimeAPI;
}

export interface MainExtensionContext extends HostMainExtensionContextValues {
  readonly ipc: MainExtensionIPC;
  readonly systemPrompt: {
    register(prompt: MainSystemPromptRegistration): void;
  };
  readonly tools: {
    register<TParams extends TSchema = TSchema>(tool: AgentTool<TParams>): void;
  };
}

export type MainExtensionSetup = (ctx: MainExtensionContext) => void | ExtensionDisposer;

export interface MainExtensionDefinition extends ExtensionMetadata {
  setup: MainExtensionSetup;
}

export type AnyMainExtensionDefinition = MainExtensionDefinition;

export function defineMainExtension(definition: MainExtensionDefinition): MainExtensionDefinition {
  return definition;
}
