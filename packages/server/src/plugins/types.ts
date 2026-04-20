import type { TSchema } from '@sinclair/typebox';

// ── Plugin Tool ───────────────────────────────────────────────────────────────

export interface PluginToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface PluginToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    ctx: PluginContext,
  ) => Promise<PluginToolResult>;
}

// ── Plugin Context ────────────────────────────────────────────────────────────

export interface PluginContext {
  sessionId: string;
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface SessionStartEvent {
  sessionId: string;
}

export interface BeforeAgentStartEvent {
  sessionId: string;
  prompt: string;
  systemPrompt: string;
}

export interface BeforeAgentStartResult {
  systemPrompt?: string;
}

export interface AgentStartEvent {
  sessionId: string;
  prompt: string;
}

export interface AgentEndEvent {
  sessionId: string;
}

export interface ToolCallEvent {
  sessionId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
}

export interface ToolCallBlockResult {
  block: true;
  reason?: string;
}

export interface ToolResultEvent {
  sessionId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

export interface ToolResultPatch {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// ── Event handler map ─────────────────────────────────────────────────────────

export type EventHandlerMap = {
  session_start: (event: SessionStartEvent, ctx: PluginContext) => Promise<void> | void;
  before_agent_start: (
    event: BeforeAgentStartEvent,
    ctx: PluginContext,
  ) => Promise<BeforeAgentStartResult | void> | BeforeAgentStartResult | void;
  agent_start: (event: AgentStartEvent, ctx: PluginContext) => Promise<void> | void;
  agent_end: (event: AgentEndEvent, ctx: PluginContext) => Promise<void> | void;
  tool_call: (
    event: ToolCallEvent,
    ctx: PluginContext,
  ) => Promise<ToolCallBlockResult | void> | ToolCallBlockResult | void;
  tool_result: (
    event: ToolResultEvent,
    ctx: PluginContext,
  ) => Promise<ToolResultPatch | void> | ToolResultPatch | void;
};

export type EventName = keyof EventHandlerMap;

// ── Extension API (given to each plugin's default export) ────────────────────

export interface ExtensionAPI {
  on<E extends EventName>(event: E, handler: EventHandlerMap[E]): void;
  registerTool(definition: PluginToolDefinition): void;
}
