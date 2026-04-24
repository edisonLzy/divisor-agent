import {
  Agent,
  type AgentEvent,
} from '@mariozechner/pi-agent-core';
import { PermissionService } from './permissions/index.js';
import { ExtensionRegistry } from './extensions/index.js';
import { loadAllExtensions } from './extensions/loader.js';
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from './tools/index.js';
import { ModelService } from './models/index.js';
import type {
  SessionPromptParams,
  BunToWebViewMessage,
} from '../shared/ipc-types.js';

export type WebViewSender = (msg: BunToWebViewMessage) => void;

export class AgentRuntime {
  private sessions = new Map<string, { agent: Agent }>();
  private permissionService: PermissionService;
  private extensionRegistry: ExtensionRegistry;
  private modelService: ModelService;
  private sendToWebView: WebViewSender | null = null;
  private homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
    this.permissionService = new PermissionService();
    this.extensionRegistry = new ExtensionRegistry();
    this.modelService = new ModelService((sessionId) => {
      return this.sessions.get(sessionId)?.agent;
    });
  }

  async setModel(sessionId: string, provider: string, modelId: string) {
    return this.modelService.setModel(sessionId, provider, modelId);
  }

  cycleModel(sessionId: string, direction: 'next' | 'prev' = 'next') {
    return this.modelService.cycleModel(sessionId, direction);
  }

  getAvailableModels() {
    return this.modelService.getAvailableModels();
  }

  setWebViewSender(send: WebViewSender) {
    this.sendToWebView = send;
  }

  async initialize(): Promise<void> {
    this.permissionService.setRequestCallback((req) => {
      this.sendToWebView?.({
        event: 'sessionRequestPermission',
        payload: req,
      });
    });

    await loadAllExtensions(this.extensionRegistry, this.homeDir);
  }

  private getOrCreateAgent(sessionId: string): Agent {
    if (!this.sessions.has(sessionId)) {
      const agent = new Agent({
        sessionId,
        initialState: {
          systemPrompt: '',
          thinkingLevel: 'off',
          tools: [
            fsReadTextFileTool,
            fsWriteTextFileTool,
            terminalCreateTool,
            ...this.extensionRegistry.getTools(),
          ],
        },
        beforeToolCall: async (context) => {
          const op = context.toolCall.name;
          if (this.permissionService.isHighRisk(op)) {
            const approved = await this.permissionService.requestPermission(
              `${sessionId}-${context.toolCall.id}`,
              op,
              context.args as Record<string, unknown>,
            );
            if (!approved) {
              return { block: true, reason: 'User rejected' };
            }
          }
        },
      });

      agent.subscribe((event: AgentEvent) => {
        if (event.type === 'message_update') {
          const { assistantMessageEvent } = event;
          if (assistantMessageEvent.type === 'text_delta') {
            this.sendToWebView?.({
              event: 'agentMessageChunk',
              payload: {
                type: 'text_delta',
                delta: assistantMessageEvent.delta,
                chunkIndex: 0,
                sessionId,
              },
            });
          } else if (assistantMessageEvent.type === 'thinking_delta') {
            this.sendToWebView?.({
              event: 'agentMessageChunk',
              payload: {
                type: 'thinking_delta',
                delta: assistantMessageEvent.delta,
                chunkIndex: 0,
                sessionId,
              },
            });
          }
        }
      });

      this.sessions.set(sessionId, { agent });
    }
    return this.sessions.get(sessionId)!.agent;
  }

  async prompt(params: SessionPromptParams): Promise<void> {
    const { sessionId, content, model } = params;
    const agent = this.getOrCreateAgent(sessionId);

    try {
      if (model) {
        agent.state.model = model as any;
      }
      await agent.prompt(content);

      this.sendToWebView?.({
        event: 'agentMessageDone',
        payload: { sessionId },
      });
    } catch (err) {
      console.error(`Agent error for session ${sessionId}:`, err);
      this.sendToWebView?.({
        event: 'agentMessageDone',
        payload: { sessionId },
      });
    }
  }

  approvePermission(requestId: string): void {
    this.permissionService.approve(requestId);
  }

  rejectPermission(requestId: string): void {
    this.permissionService.reject(requestId);
  }

  listExtensions() {
    return this.extensionRegistry.listExtensions();
  }
}
