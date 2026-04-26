import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { Agent, AgentState } from "@mariozechner/pi-agent-core";
import Emittery from "emittery";
import { nanoid } from "nanoid";

import type {
  ChatMessageStatus,
  ResponseChatMessage,
  ThinkingChatMessage,
  ToolChatMessage,
} from "../shared/message-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { ModelRegistry } from "./models/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";

interface ActiveAssistantTurn {
  responseIds: Map<number, string>;
  thinkingIds: Map<number, string>;
  toolIds: Map<string, string>;
  toolArgs: Map<string, unknown>;
}

type AgentEvents = {
  agentMessageChunk: {
    sessionId: string;
    message: ResponseChatMessage | ThinkingChatMessage | ToolChatMessage;
  };
  agentMessageDone: { sessionId: string };
};

export class AgentRuntime extends Emittery<AgentEvents> implements AgentSessionIPC, AgentModelsIPC {
  private modelRegistry: ModelRegistry;
  private agent: Agent;
  private activeSessionId = "";
  private activeTurnBySession = new Map<string, ActiveAssistantTurn>();

  constructor() {
    super();
    this.modelRegistry = new ModelRegistry();
    this.agent = this.createInternalAgent();
  }

  private createInternalAgent() {
    const agent = new Agent({
      getApiKey: (provider) => {
        return this.modelRegistry.resolveApiKey(provider);
      },
      initialState: {
        tools: [fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool],
      },
    });

    agent.subscribe((event) => {
      this.handleAgentEvent(event);
    });

    return agent;
  }

  private getCurrentSessionId() {
    return this.activeSessionId;
  }

  private getOrCreateActiveTurn(sessionId: string): ActiveAssistantTurn {
    let activeTurn = this.activeTurnBySession.get(sessionId);
    if (!activeTurn) {
      activeTurn = {
        responseIds: new Map(),
        thinkingIds: new Map(),
        toolIds: new Map(),
        toolArgs: new Map(),
      };
      this.activeTurnBySession.set(sessionId, activeTurn);
    }
    return activeTurn;
  }

  private resetActiveTurn(sessionId: string) {
    this.activeTurnBySession.delete(sessionId);
  }

  private emitRenderableMessage(
    sessionId: string,
    message: ResponseChatMessage | ThinkingChatMessage | ToolChatMessage,
  ) {
    this.emit("agentMessageChunk", {
      sessionId,
      message,
    });
  }

  private upsertResponseMessage(
    sessionId: string,
    contentIndex: number,
    content: string,
    status: ChatMessageStatus,
  ) {
    const activeTurn = this.getOrCreateActiveTurn(sessionId);
    const id = activeTurn.responseIds.get(contentIndex) ?? nanoid();
    activeTurn.responseIds.set(contentIndex, id);

    this.emitRenderableMessage(sessionId, {
      id,
      sessionId,
      role: "assistant",
      kind: "response",
      content,
      status,
      createdAt: Date.now(),
    });
  }

  private upsertThinkingMessage(
    sessionId: string,
    contentIndex: number,
    content: string,
    status: ChatMessageStatus,
  ) {
    const activeTurn = this.getOrCreateActiveTurn(sessionId);
    const id = activeTurn.thinkingIds.get(contentIndex) ?? nanoid();
    activeTurn.thinkingIds.set(contentIndex, id);

    this.emitRenderableMessage(sessionId, {
      id,
      sessionId,
      role: "assistant",
      kind: "thinking",
      content,
      status,
      createdAt: Date.now(),
    });
  }

  private upsertToolMessage(
    sessionId: string,
    params: Omit<ToolChatMessage, "id" | "sessionId" | "role" | "kind" | "createdAt">,
  ) {
    const activeTurn = this.getOrCreateActiveTurn(sessionId);
    const id = activeTurn.toolIds.get(params.toolCallId) ?? nanoid();
    activeTurn.toolIds.set(params.toolCallId, id);

    this.emitRenderableMessage(sessionId, {
      id,
      sessionId,
      role: "assistant",
      kind: "tool",
      createdAt: Date.now(),
      ...params,
    });
  }

  private readTextContent(result: { content?: Array<{ type: string; text?: string }> }) {
    return (result.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();
  }

  private handleAgentEvent(event: AgentEvent) {
    const sessionId = this.getCurrentSessionId();
    if (!sessionId) {
      return;
    }

    if (event.type === "message_start" && event.message.role === "assistant") {
      this.resetActiveTurn(sessionId);
      return;
    }

    if (event.type === "message_update") {
      const { assistantMessageEvent } = event;
      if (assistantMessageEvent.type === "text_delta") {
        const block = assistantMessageEvent.partial.content[assistantMessageEvent.contentIndex];
        this.upsertResponseMessage(
          sessionId,
          assistantMessageEvent.contentIndex,
          block?.type === "text" ? block.text : "",
          "streaming",
        );
        return;
      }

      if (assistantMessageEvent.type === "text_end") {
        this.upsertResponseMessage(
          sessionId,
          assistantMessageEvent.contentIndex,
          assistantMessageEvent.content,
          "done",
        );
        return;
      }

      if (assistantMessageEvent.type === "thinking_delta") {
        const block = assistantMessageEvent.partial.content[assistantMessageEvent.contentIndex];
        this.upsertThinkingMessage(
          sessionId,
          assistantMessageEvent.contentIndex,
          block?.type === "thinking" ? block.thinking : "",
          "streaming",
        );
        return;
      }

      if (assistantMessageEvent.type === "thinking_end") {
        this.upsertThinkingMessage(
          sessionId,
          assistantMessageEvent.contentIndex,
          assistantMessageEvent.content,
          "done",
        );
      }
      return;
    }

    if (event.type === "tool_execution_start") {
      this.getOrCreateActiveTurn(sessionId).toolArgs.set(event.toolCallId, event.args);
      this.upsertToolMessage(sessionId, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        input: JSON.stringify(event.args, null, 2),
        output: "",
        state: "running",
      });
      return;
    }

    if (event.type === "tool_execution_update") {
      this.getOrCreateActiveTurn(sessionId).toolArgs.set(event.toolCallId, event.args);
      this.upsertToolMessage(sessionId, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        input: JSON.stringify(event.args, null, 2),
        output: this.readTextContent(event.partialResult),
        details: event.partialResult.details,
        state: "running",
      });
      return;
    }

    if (event.type === "tool_execution_end") {
      const activeTurn = this.getOrCreateActiveTurn(sessionId);
      const args = activeTurn.toolArgs.get(event.toolCallId) ?? {};
      this.upsertToolMessage(sessionId, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args,
        input: JSON.stringify(args, null, 2),
        output: this.readTextContent(event.result),
        details: event.result.details,
        state: event.isError ? "error" : "done",
      });
    }
  }

  private updateState<T extends keyof AgentState>(key: T, value: AgentState[T]) {
    this.agent.state[key] = value;
  }

  public setModel: AgentModelsIPC["setModel"] = async (model) => {
    const { modelId, providerId } = model;
    const modelInfo = this.modelRegistry.resolveModel(providerId, modelId);
    if (!modelInfo) {
      console.warn(`Model not found: ${providerId}/${modelId}`);
      return false;
    }
    this.updateState("model", modelInfo);
    return true;
  };

  public getAvailableModels: AgentModelsIPC["getAvailableModels"] = async () => {
    return this.modelRegistry.getAvailableModels().map((m) => {
      return {
        modelId: m.id,
        providerId: m.provider,
        modelName: `${m.provider}/${m.id}`,
      };
    });
  };

  public setSessionId: AgentSessionIPC["setSessionId"] = async (sessionId: string) => {
    this.activeSessionId = sessionId;
    this.agent.sessionId = sessionId;
  };

  public setHistoryMessages: AgentSessionIPC["setHistoryMessages"] = async (_messages) => {
    // TODO: implement history
    return;
  };

  public prompt: AgentSessionIPC["prompt"] = async (params) => {
    const { sessionId, content, model } = params;

    try {
      this.activeSessionId = sessionId;
      if (model) {
        await this.setModel(model);
      }

      await this.agent.prompt(content);

      this.emit("agentMessageDone", { sessionId });
    } catch (err) {
      console.error(`Agent error for session ${sessionId}:`, err);
      this.emit("agentMessageDone", { sessionId });
    } finally {
      this.resetActiveTurn(sessionId);
    }
  };

  public destroy() {
    this.clearListeners();
  }
}
