import type { Agent } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";

import { modelRegistry } from "./registry.js";

export interface ModelInfo {
  providerId: string;
  modelId: string;
  modelName: string;
  isBuiltIn: boolean;
  reasoning?: boolean;
  contextWindow?: number;
}

export interface SetModelResult {
  success: boolean;
  error?: string;
}

export class ModelService {
  constructor(private getAgent: (sessionId: string) => Agent | undefined) {}

  async setModel(sessionId: string, provider: string, modelId: string): Promise<SetModelResult> {
    const agent = this.getAgent(sessionId);
    if (!agent) {
      return { success: false, error: "Session not found" };
    }

    const model = modelRegistry.resolveModel(provider, modelId);
    if (!model) {
      return {
        success: false,
        error: `Model not found: ${provider}/${modelId}`,
      };
    }

    const apiKey = modelRegistry.resolveApiKey(provider, model);
    if (!apiKey) {
      return { success: false, error: `No API key for provider: ${provider}` };
    }

    agent.state.model = model;
    // Note: apiKey 需要通过其他方式传递给 Agent

    return { success: true };
  }

  cycleModel(sessionId: string, direction: "next" | "prev" = "next"): ModelInfo | null {
    const agent = this.getAgent(sessionId);
    if (!agent) return null;

    const current = agent.state.model;
    if (!current) return null;

    const models = modelRegistry.getModelsByProvider(current.provider);
    if (models.length === 0) return null;

    const idx = models.findIndex((m) => m.id === current.id);
    const delta = direction === "next" ? 1 : -1;
    const next = models[(idx + delta + models.length) % models.length];

    agent.state.model = next;

    return this.toModelInfo(next);
  }

  getAvailableModels(): ModelInfo[] {
    return modelRegistry.getAvailableModels().map((m) => this.toModelInfo(m));
  }

  private toModelInfo(model: Model<any>): ModelInfo {
    return {
      providerId: model.provider,
      modelId: model.id,
      modelName: model.name,
      isBuiltIn: !model.baseUrl,
      reasoning: model.reasoning,
      contextWindow: model.contextWindow,
    };
  }
}
