export { pluginRegistry } from './registry.js';

export { loadPlugins, loadPluginFile, discoverPluginPaths } from './loader.js';

export type {
  ExtensionAPI,
  PluginContext,
  PluginToolDefinition,
  PluginToolResult,
  EventName,
  EventHandlerMap,
  SessionStartEvent,
  BeforeAgentStartEvent,
  BeforeAgentStartResult,
  AgentStartEvent,
  AgentEndEvent,
  ToolCallEvent,
  ToolCallBlockResult,
  ToolResultEvent,
  ToolResultPatch,
} from './types.js';
