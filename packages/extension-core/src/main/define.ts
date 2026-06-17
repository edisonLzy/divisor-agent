import type { AgentEvent, AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";

import type { ExtensionManifest } from "../manifest.js";

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
  promptAgent(
    agentId: string,
    content: string,
    metadata?: { model?: ExtensionAgentModel },
  ): Promise<void>;
  subscribeAgentEvents(
    agentId: string,
    listener: (event: ExtensionAgentEvent) => void | Promise<void>,
  ): () => void;
}

export interface MainExtensionContext {
  manifest: ExtensionManifest;
  runtime: MainExtensionRuntimeAPI;
  systemPrompt: {
    register(prompt: MainSystemPromptRegistration): void;
  };
  tools: {
    register<TParams extends TSchema = TSchema>(tool: AgentTool<TParams>): void;
  };
}

export type MainExtensionSetup = (ctx: MainExtensionContext) => void;

export interface MainExtensionDefinition {
  setup: MainExtensionSetup;
}

export function defineMainExtension(setup: MainExtensionSetup): MainExtensionDefinition {
  return { setup };
}
