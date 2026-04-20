import { createLogger } from '../shared/logger.js';
import type {
  BeforeAgentStartResult,
  EventHandlerMap,
  EventName,
  PluginContext,
  PluginToolDefinition,
  ToolCallBlockResult,
  ToolResultPatch,
} from './types.js';

const logger = createLogger('plugins:registry');

class PluginRegistry {
  private handlers = new Map<EventName, Array<EventHandlerMap[EventName]>>();
  private tools: PluginToolDefinition[] = [];

  on<E extends EventName>(event: E, handler: EventHandlerMap[E]): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    this.handlers.get(event)!.push(handler as EventHandlerMap[EventName]);
  }

  registerTool(definition: PluginToolDefinition): void {
    this.tools.push(definition);
    logger.info({ toolName: definition.name }, 'Plugin tool registered');
  }

  getTools(): PluginToolDefinition[] {
    return [...this.tools];
  }

  async emitSessionStart(sessionId: string, ctx: PluginContext): Promise<void> {
    const handlers = (this.handlers.get('session_start') ?? []) as Array<EventHandlerMap['session_start']>;

    for (const handler of handlers) {
      try {
        await handler({ sessionId }, ctx);
      } catch (err) {
        logger.error({ err, sessionId }, 'Plugin session_start handler error');
      }
    }
  }

  async emitBeforeAgentStart(
    sessionId: string,
    prompt: string,
    systemPrompt: string,
    ctx: PluginContext,
  ): Promise<BeforeAgentStartResult> {
    const handlers = (this.handlers.get('before_agent_start') ?? []) as Array<EventHandlerMap['before_agent_start']>;
    let currentSystemPrompt = systemPrompt;

    for (const handler of handlers) {
      try {
        const result = await handler(
          { sessionId, prompt, systemPrompt: currentSystemPrompt },
          ctx,
        );

        if (result?.systemPrompt !== undefined) {
          currentSystemPrompt = result.systemPrompt;
        }
      } catch (err) {
        logger.error({ err, sessionId }, 'Plugin before_agent_start handler error');
      }
    }

    return { systemPrompt: currentSystemPrompt };
  }

  async emitAgentStart(sessionId: string, prompt: string, ctx: PluginContext): Promise<void> {
    const handlers = (this.handlers.get('agent_start') ?? []) as Array<EventHandlerMap['agent_start']>;

    for (const handler of handlers) {
      try {
        await handler({ sessionId, prompt }, ctx);
      } catch (err) {
        logger.error({ err, sessionId }, 'Plugin agent_start handler error');
      }
    }
  }

  async emitAgentEnd(sessionId: string, ctx: PluginContext): Promise<void> {
    const handlers = (this.handlers.get('agent_end') ?? []) as Array<EventHandlerMap['agent_end']>;

    for (const handler of handlers) {
      try {
        await handler({ sessionId }, ctx);
      } catch (err) {
        logger.error({ err, sessionId }, 'Plugin agent_end handler error');
      }
    }
  }

  async emitToolCall(
    sessionId: string,
    toolName: string,
    toolCallId: string,
    input: unknown,
    ctx: PluginContext,
  ): Promise<ToolCallBlockResult | undefined> {
    const handlers = (this.handlers.get('tool_call') ?? []) as Array<EventHandlerMap['tool_call']>;

    for (const handler of handlers) {
      try {
        const result = await handler({ sessionId, toolName, toolCallId, input }, ctx);

        if (result?.block) {
          return result as ToolCallBlockResult;
        }
      } catch (err) {
        logger.error({ err, sessionId, toolName }, 'Plugin tool_call handler error');
      }
    }

    return undefined;
  }

  async emitToolResult(
    sessionId: string,
    toolName: string,
    toolCallId: string,
    input: unknown,
    content: Array<{ type: string; text: string }>,
    isError: boolean,
    ctx: PluginContext,
  ): Promise<ToolResultPatch> {
    const handlers = (this.handlers.get('tool_result') ?? []) as Array<EventHandlerMap['tool_result']>;
    let currentContent = content;
    let currentIsError = isError;

    for (const handler of handlers) {
      try {
        const result = await handler(
          { sessionId, toolName, toolCallId, input, content: currentContent, isError: currentIsError },
          ctx,
        );

        if (result) {
          if (result.content !== undefined) currentContent = result.content;
          if (result.isError !== undefined) currentIsError = result.isError;
        }
      } catch (err) {
        logger.error({ err, sessionId, toolName }, 'Plugin tool_result handler error');
      }
    }

    return { content: currentContent, isError: currentIsError };
  }

  reset(): void {
    this.handlers.clear();
    this.tools.length = 0;
  }
}

export const pluginRegistry = new PluginRegistry();

export type { PluginRegistry };
