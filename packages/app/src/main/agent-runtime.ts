import { Agent, AgentState } from "@mariozechner/pi-agent-core";
import Emittery from "emittery";

import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { ModelRegistry } from "./models/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";

type AgentEvents = {
  agentMessageChunk: {
    type: "text_delta" | "thinking_delta";
    delta: string;
    chunkIndex: number;
    sessionId: string;
  };
  agentMessageDone: { sessionId: string };
};

export class AgentRuntime extends Emittery<AgentEvents> implements AgentSessionIPC, AgentModelsIPC {
  private modelRegistry: ModelRegistry;
  private agent: Agent;

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
      if (event.type === "message_update") {
        const { assistantMessageEvent } = event;
        if (assistantMessageEvent.type === "text_delta") {
          this.emit("agentMessageChunk", {
            type: "text_delta",
            delta: assistantMessageEvent.delta,
            chunkIndex: 0,
            sessionId: "",
          });
        } else if (assistantMessageEvent.type === "thinking_delta") {
          this.emit("agentMessageChunk", {
            type: "thinking_delta",
            delta: assistantMessageEvent.delta,
            chunkIndex: 0,
            sessionId: "",
          });
        }
      }
    });

    return agent;
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
    this.agent.sessionId = sessionId;
  };

  public setHistoryMessages: AgentSessionIPC["setHistoryMessages"] = async (messages) => {
    // TODO: implement history
    return;
  };

  public prompt: AgentSessionIPC["prompt"] = async (params) => {
    const { sessionId, content, model } = params;

    try {
      if (model) {
        this.setModel(model);
      }

      await this.agent.prompt(content);

      this.emit("agentMessageDone", { sessionId });
    } catch (err) {
      console.error(`Agent error for session ${sessionId}:`, err);
      this.emit("agentMessageDone", { sessionId });
    }
  };

  public destroy() {
    this.clearListeners();
  }
}
