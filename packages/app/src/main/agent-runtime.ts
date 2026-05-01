import { Agent, AgentState } from "@mariozechner/pi-agent-core";
import Emittery from "emittery";

import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { ModelRegistry } from "./models/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";

export class AgentRuntime
  extends Emittery<AllowedMainExposeEvents>
  implements AgentSessionIPC, AgentModelsIPC
{
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
      this.emit(event.type, event);
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
        providerName: m.provider,
        modelName: m.name ?? m.id,
      };
    });
  };

  public setSessionId: AgentSessionIPC["setSessionId"] = async (sessionId: string) => {
    this.agent.sessionId = sessionId;
  };

  public setHistoryMessages: AgentSessionIPC["setHistoryMessages"] = async (_messages) => {
    // TODO: implement history
    return;
  };

  public prompt: AgentSessionIPC["prompt"] = async (params) => {
    const { content, model } = params;

    if (model) {
      this.setModel(model);
    }

    this.agent.prompt(content);
  };

  public destroy() {
    this.clearListeners();
  }
}
