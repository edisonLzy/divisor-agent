import type { AgentEvent, AgentTool, AppUserMessage } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import type { BrowserWindow } from "electron";

import type {
  AnyExtensionIPCFunction,
  ExtensionDisposer,
  ExtensionMetadata,
} from "../common/ipc/index.js";
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

export interface MainExtensionContext<
  AllowedRenderInvokeEvents = Record<string, AnyExtensionIPCFunction>,
  AllowedMainExposeEvents = Record<string, AnyExtensionIPCFunction>,
> extends HostMainExtensionContextValues {
  readonly ipc: MainExtensionIPC<AllowedRenderInvokeEvents, AllowedMainExposeEvents>;
  readonly systemPrompt: {
    register(prompt: MainSystemPromptRegistration): void;
  };
  readonly tools: {
    register<TParams extends TSchema = TSchema>(tool: AgentTool<TParams>): void;
  };
}

export type MainExtensionSetup<
  AllowedRenderInvokeEvents = Record<string, AnyExtensionIPCFunction>,
  AllowedMainExposeEvents = Record<string, AnyExtensionIPCFunction>,
> = (
  ctx: MainExtensionContext<AllowedRenderInvokeEvents, AllowedMainExposeEvents>,
) => void | ExtensionDisposer;

export interface MainExtensionDefinition<
  AllowedRenderInvokeEvents = Record<string, AnyExtensionIPCFunction>,
  AllowedMainExposeEvents = Record<string, AnyExtensionIPCFunction>,
> extends ExtensionMetadata {
  setup: MainExtensionSetup<AllowedRenderInvokeEvents, AllowedMainExposeEvents>;
}

export type AnyMainExtensionDefinition = MainExtensionDefinition<
  Record<string, AnyExtensionIPCFunction>,
  Record<string, AnyExtensionIPCFunction>
>;

export function defineMainExtension<
  AllowedRenderInvokeEvents extends {
    [K in keyof AllowedRenderInvokeEvents]: AnyExtensionIPCFunction;
  } = Record<string, AnyExtensionIPCFunction>,
  AllowedMainExposeEvents extends {
    [K in keyof AllowedMainExposeEvents]: AnyExtensionIPCFunction;
  } = Record<string, AnyExtensionIPCFunction>,
>(
  definition: MainExtensionDefinition<AllowedRenderInvokeEvents, AllowedMainExposeEvents>,
): MainExtensionDefinition<AllowedRenderInvokeEvents, AllowedMainExposeEvents> {
  return definition;
}
