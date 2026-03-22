import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import { createLogger } from '../../shared/logger.js';
import {
  createSession,
  appendMessage,
  forkSession,
  getSessionHistory,
} from '../sessions/service.js';
import { resolveCustomModelConfig } from '../models/service.js';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessageEvent, Model } from '@mariozechner/pi-ai';
import type { HistoryMessage, MessageBlock } from '../sessions/types.js';

const logger = createLogger('agent');

// ── ACP message structures ──────────────────────────────────────────────────

export interface AcpMessage {
  type: string;
  sessionId: string;
  messageId?: string;
  payload: Record<string, unknown>;
}

interface PendingToolCall {
  resolve: (result: string) => void;
  reject: (reason: string) => void;
}

interface PendingPermission {
  resolve: (approved: boolean) => void;
}

// ── Session state ─────────────────────────────────────────────────────────

interface SessionState {
  agent: Agent;
  ws: WebSocket;
  pendingToolCalls: Map<string, PendingToolCall>;
  pendingPermissions: Map<string, PendingPermission>;
}

const sessions = new Map<string, SessionState>();

// ── Tool factory: delegates a tool call to Rust via WebSocket ──────────────

type ToolDelegateType = 'read' | 'write' | 'terminal';

function makeToolDelegate(
  sessionId: string,
  toolType: ToolDelegateType,
  msgType: string,
): AgentTool {
  const isHighRisk = toolType !== 'read';
  // Command patterns that are always blocked (require explicit approval)
  const BLOCKED_COMMANDS = /rm\s+-rf|sudo\s+rm|DROP\s+TABLE|format\s+[a-z]:/i;

  const parameters =
    toolType === 'terminal'
      ? Type.Object({ command: Type.String({ description: 'Shell command to execute' }) })
      : Type.Object({ path: Type.String({ description: 'File path' }) });

  return {
    name: msgType.replace('/', '_'),
    label: msgType,
    description:
      toolType === 'read'
        ? 'Read a text file from the local filesystem'
        : toolType === 'write'
          ? 'Write content to a local file. Requires user approval.'
          : 'Execute a terminal command. Requires user approval.',
    parameters,
    execute: async (toolCallId, params, _signal) => {
      const state = sessions.get(sessionId);
      if (!state) throw new Error('Session WebSocket not found');

      // Security: block dangerous patterns without even asking
      if (toolType === 'terminal') {
        const { command } = params as { command: string };
        if (BLOCKED_COMMANDS.test(command)) {
          logger.warn({ sessionId, toolCallId, command }, 'Blocked dangerous command');
          return {
            content: [{ type: 'text', text: `Command blocked by security policy: ${command}` }],
            details: { blocked: true },
            isError: true,
          };
        }
      }

      // High-risk ops require user approval first
      if (isHighRisk) {
        const requestId = randomUUID();
        const operation =
          toolType === 'write' ? 'fs_write' : 'terminal_exec';

        const approved = await new Promise<boolean>((resolve) => {
          state.pendingPermissions.set(requestId, { resolve });
          sendMessage(state.ws, {
            type: 'session/request_permission',
            sessionId,
            payload: {
              requestId,
              operation,
              params,
            },
          });
          logger.info({ sessionId, requestId, operation }, 'Permission requested');
        });

        if (!approved) {
          logger.info({ sessionId, requestId }, 'Permission denied');
          return {
            content: [{ type: 'text', text: 'Permission denied by user.' }],
            details: { denied: true },
            isError: true,
          };
        }
        logger.info({ sessionId, requestId }, 'Permission approved');
      }

      // Delegate actual execution to Rust
      return new Promise((resolve, reject) => {
        state.pendingToolCalls.set(toolCallId, {
          resolve: (resultText: string) => {
            resolve({
              content: [{ type: 'text', text: resultText }],
              details: {},
            });
          },
          reject: (reason: string) => {
            reject(new Error(reason));
          },
        });

        sendMessage(state.ws, {
          type: msgType,
          sessionId,
          messageId: toolCallId,
          payload: { toolCallId, ...(params as Record<string, unknown>) },
        });
      });
    },
  };
}

// ── Utility ────────────────────────────────────────────────────────────────

function sendMessage(ws: WebSocket, msg: Partial<AcpMessage>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function buildTools(sessionId: string): AgentTool[] {
  return [
    makeToolDelegate(sessionId, 'read', 'fs/read_text_file'),
    makeToolDelegate(sessionId, 'write', 'fs/write_text_file'),
    makeToolDelegate(sessionId, 'terminal', 'terminal/create'),
  ];
}

// ── Model resolution ─────────────────────────────────────────────────────────

interface ResolvedModel {
  instance: Model<string>;
  getApiKey?: (provider: string) => string | undefined;
}

async function resolveSessionModel(
  payload: Record<string, unknown>,
): Promise<ResolvedModel> {
  const modelPayload = payload.model as
    | { providerId: string; modelId: string }
    | undefined;

  if (!modelPayload?.providerId || !modelPayload?.modelId) {
    return { instance: getModel('anthropic', 'claude-sonnet-4-20250514') };
  }

  const { providerId, modelId } = modelPayload;

  // Built-in providers: delegate to getModel
  const BUILT_IN_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'xai', 'groq', 'mistral', 'minimax', 'minimax-cn'];
  if (BUILT_IN_PROVIDERS.includes(providerId)) {
    try {
       
      return { instance: getModel(providerId as any, modelId as any) };
    } catch {
      logger.warn({ providerId, modelId }, 'Built-in model not found, using default');
      return { instance: getModel('anthropic', 'claude-sonnet-4-20250514') };
    }
  }

  // Custom provider: resolve via models.json
  const customConfig = await resolveCustomModelConfig(providerId, modelId);
  if (!customConfig) {
    logger.warn({ providerId, modelId }, 'Custom model config not found, using default');
    return { instance: getModel('anthropic', 'claude-sonnet-4-20250514') };
  }

  const customModel: Model<string> = {
    id: modelId,
    name: modelId,
    api: customConfig.api,
    provider: providerId,
    baseUrl: customConfig.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };

  const { apiKey } = customConfig;

  return {
    instance: customModel,
    getApiKey: () => apiKey,
  };
}

// ── Handlers ───────────────────────────────────────────────────────────────

export async function handleSessionStart(
  ws: WebSocket,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Idempotent: reuse existing session if reconnecting
  if (sessions.has(sessionId)) {
    sessions.get(sessionId)!.ws = ws;
    logger.info({ sessionId }, 'Session reconnected');
    return;
  }

  // Ensure session exists in storage
  try {
    await createSession({ id: sessionId, parentId: payload.parentId as string | undefined });
  } catch {
    // Session may already exist on disk
  }

  const model = await resolveSessionModel(payload);

  logger.info({ sessionId, modelId: model.instance.id }, 'Session model resolved');

  const agent = new Agent({
    initialState: {
      systemPrompt:
        'You are a helpful AI coding assistant. You have access to the local file system and terminal via tools. Always ask for clarification if needed.',
      model: model.instance,
    },
    getApiKey: model.getApiKey,
  });

  const state: SessionState = {
    agent,
    ws,
    pendingToolCalls: new Map(),
    pendingPermissions: new Map(),
  };

  agent.setTools(buildTools(sessionId));
  sessions.set(sessionId, state);

  // Load existing messages if any (for session resumption)
  const history = await getSessionHistory(sessionId);
  if (history.messages.length > 0) {
    const agentMessages = history.messages.flatMap((m: HistoryMessage) => {
      if (m.role === 'user') {
        return [{
          role: 'user' as const,
          content: m.blocks
            .map((b: MessageBlock) => ({ type: 'text' as const, text: b.type === 'text' ? b.content : '' }))
            .filter((b: { type: 'text'; text: string }) => b.text),
          timestamp: m.timestamp,
        }];
      }
      // assistant messages are handled by pi-agent-core internally after prompts
      return [];
    });
    if (agentMessages.length > 0) {
      agent.replaceMessages(agentMessages);
    }
  }

  logger.info({ sessionId }, 'Session started');
  sendMessage(ws, { type: 'session/started', sessionId, payload: { sessionId } });
}

export async function handleSessionPrompt(
  ws: WebSocket,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const state = sessions.get(sessionId);
  if (!state) {
    logger.warn({ sessionId }, 'Prompt received for unknown session');
    sendMessage(ws, {
      type: 'acp/error',
      sessionId,
      payload: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not started` },
    });
    return;
  }

  const content = payload.content as string;
  if (!content?.trim()) return;

  // Persist user message
  const userMsg: HistoryMessage = {
    id: randomUUID(),
    sessionId,
    role: 'user',
    blocks: [{ type: 'text', content }],
    timestamp: Date.now(),
  };
  await appendMessage(sessionId, userMsg);

  // Collect assistant response blocks for persistence
  const assistantBlocks: MessageBlock[] = [];
  let chunkIndex = 0;

  const unsubscribe = state.agent.subscribe((event) => {
    if (event.type === 'message_update') {
      const ae = event.assistantMessageEvent as AssistantMessageEvent;
      if (ae.type === 'text_delta') {
        const textBlock = assistantBlocks.find(b => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          textBlock.content += ae.delta;
        } else {
          assistantBlocks.push({ type: 'text', content: ae.delta });
        }
        sendMessage(ws, {
          type: 'agent_message_chunk',
          sessionId,
          payload: {
            type: 'text_delta',
            delta: ae.delta,
            chunkIndex: chunkIndex++,
          },
        });
      } else if (ae.type === 'thinking_delta') {
        const thinkBlock = assistantBlocks.find(b => b.type === 'thinking');
        if (thinkBlock && thinkBlock.type === 'thinking') {
          thinkBlock.content += ae.delta;
        } else {
          assistantBlocks.push({ type: 'thinking', content: ae.delta });
        }
        sendMessage(ws, {
          type: 'agent_message_chunk',
          sessionId,
          payload: {
            type: 'thinking_delta',
            delta: ae.delta,
            chunkIndex: chunkIndex++,
          },
        });
      }
    }

    if (event.type === 'tool_execution_end') {
      assistantBlocks.push({
        type: 'tool_result',
        toolName: event.toolName,
        content: String(event.result),
      });
    }
  });

  try {
    await state.agent.prompt(content);

    // Persist assistant message
    if (assistantBlocks.length > 0) {
      const assistantMsg: HistoryMessage = {
        id: randomUUID(),
        sessionId,
        role: 'assistant',
        blocks: assistantBlocks,
        timestamp: Date.now(),
      };
      await appendMessage(sessionId, assistantMsg);
    }

    sendMessage(ws, {
      type: 'agent_message_done',
      sessionId,
      payload: {},
    });
  } catch (err) {
    logger.error({ sessionId, err }, 'Agent prompt error');
    sendMessage(ws, {
      type: 'acp/error',
      sessionId,
      payload: { code: 'AGENT_ERROR', message: String(err) },
    });
  } finally {
    unsubscribe();
  }
}

export async function handleSessionFork(
  ws: WebSocket,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const messageId = payload.messageId as string | undefined;
    const newSession = await forkSession({ parentSessionId: sessionId, messageId });
    sendMessage(ws, {
      type: 'session/forked',
      sessionId,
      payload: { newSessionId: newSession.id },
    });
    logger.info({ sessionId, newSessionId: newSession.id }, 'Session forked');
  } catch (err) {
    logger.error({ sessionId, err }, 'Fork error');
    sendMessage(ws, {
      type: 'acp/error',
      sessionId,
      payload: { code: 'FORK_ERROR', message: String(err) },
    });
  }
}

export function handleToolResult(
  sessionId: string,
  toolCallId: string | undefined,
  payload: Record<string, unknown>,
  isError: boolean,
): void {
  if (!toolCallId) return;
  const state = sessions.get(sessionId);
  if (!state) return;

  const pending = state.pendingToolCalls.get(toolCallId);
  if (!pending) {
    logger.warn({ sessionId, toolCallId }, 'Received result for unknown tool call');
    return;
  }

  state.pendingToolCalls.delete(toolCallId);

  if (isError) {
    pending.reject((payload.message as string) ?? 'Unknown tool error');
    logger.warn({ sessionId, toolCallId }, 'Tool execution error');
  } else {
    pending.resolve((payload.content as string) ?? '');
    logger.info({ sessionId, toolCallId }, 'Tool result received');
  }
}

export function handlePermissionDecision(
  sessionId: string,
  payload: Record<string, unknown>,
  approved: boolean,
): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  const requestId = payload.requestId as string;
  const pending = state.pendingPermissions.get(requestId);
  if (!pending) {
    logger.warn({ sessionId, requestId }, 'Received decision for unknown permission request');
    return;
  }

  state.pendingPermissions.delete(requestId);
  pending.resolve(approved);
  logger.info({ sessionId, requestId, approved }, 'Permission decision received');
}

export function removeSession(sessionId: string): void {
  sessions.delete(sessionId);
}
