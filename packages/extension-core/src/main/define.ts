import type { AgentEvent, AgentTool, AppUserMessage } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import type { BrowserWindow } from "electron";

import type {
  AnyExtensionIPCFunction,
  ExtensionDisposer,
  ExtensionIPCArgs,
  ExtensionIPCKey,
  ExtensionIPCResult,
  ExtensionMetadata,
} from "../common/ipc/index.js";

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

export interface MainExtensionAgentEvents {
  session_destroyed: {
    sessionId: string;
  };
}

export interface MainExtensionAgentAPI {
  on<K extends keyof MainExtensionAgentEvents>(
    event: K,
    listener: (payload: MainExtensionAgentEvents[K]) => void | Promise<void>,
  ): ExtensionDisposer;
}

export interface MainExtensionIPC<InvokeEvents, OnEvents> {
  handle<K extends ExtensionIPCKey<InvokeEvents>>(
    method: K,
    handler: (
      ...args: ExtensionIPCArgs<InvokeEvents, K>
    ) =>
      | Awaited<ExtensionIPCResult<InvokeEvents, K>>
      | PromiseLike<Awaited<ExtensionIPCResult<InvokeEvents, K>>>,
  ): ExtensionDisposer;
  emit<K extends ExtensionIPCKey<OnEvents>>(event: K, ...args: ExtensionIPCArgs<OnEvents, K>): void;
}

export interface MainExtensionContext<InvokeEvents = {}, OnEvents = {}> {
  readonly agent: MainExtensionAgentAPI;
  readonly extension: ExtensionMetadata;
  getBrowserWindow(): BrowserWindow | null;
  readonly ipc: MainExtensionIPC<InvokeEvents, OnEvents>;
  readonly runtime: MainExtensionRuntimeAPI;
  readonly systemPrompt: {
    register(prompt: MainSystemPromptRegistration): void;
  };
  readonly tools: {
    register<TParams extends TSchema = TSchema>(tool: AgentTool<TParams>): void;
  };
}

export type MainExtensionSetup<InvokeEvents = {}, OnEvents = {}> = (
  ctx: MainExtensionContext<InvokeEvents, OnEvents>,
) => void | ExtensionDisposer;

export interface MainExtensionDefinition<
  InvokeEvents = {},
  OnEvents = {},
> extends ExtensionMetadata {
  setup: MainExtensionSetup<InvokeEvents, OnEvents>;
}

export type AnyMainExtensionDefinition = MainExtensionDefinition<any, any>;

export function defineMainExtension<
  InvokeEvents extends Record<keyof InvokeEvents, AnyExtensionIPCFunction> = {},
  OnEvents extends Record<keyof OnEvents, AnyExtensionIPCFunction> = {},
>(
  definition: MainExtensionDefinition<InvokeEvents, OnEvents>,
): MainExtensionDefinition<InvokeEvents, OnEvents> {
  return definition;
}
