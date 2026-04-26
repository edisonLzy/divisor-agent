import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { getModels, getProviders } from "@mariozechner/pi-ai";
import type { Api, Model, OAuthProviderInterface } from "@mariozechner/pi-ai";

export interface CustomModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  compat?: Model<Api>["compat"];
}

export interface CustomProvider {
  baseUrl: string;
  apiKey: string;
  api: Api;
  headers?: Record<string, string>;
  authHeader?: boolean;
  /** OAuth provider for /login support */
  oauth?: Omit<OAuthProviderInterface, "id">;
  models?: CustomModel[];
}

export interface CustomProvidersConfig {
  providers?: Record<string, CustomProvider>;
}

type ModelKey = `${string}/${string}`;

export class ModelRegistry {
  private customProvider = new Map<string, CustomProvider>();

  private loadedModels = new Map<ModelKey, Model<any>>();

  constructor() {
    this.loadCustomModels();
    this.loadBuiltInModels();
  }

  private loadBuiltInModels() {
    const providers = getProviders();
    for (const provider of providers) {
      const models = getModels(provider);
      for (const model of models) {
        this.loadedModels.set(`${provider}/${model.id}`, model);
      }
    }
  }

  private async loadCustomModels() {
    try {
      const configPath = resolve(homedir(), ".pi", "agent", "models.json");
      const content = await readFile(configPath, {
        encoding: "utf-8",
      });
      const config: CustomProvidersConfig = JSON.parse(content);

      if (config.providers) {
        for (const [name, cfg] of Object.entries(config.providers)) {
          this.customProvider.set(name, cfg);

          if (cfg.models) {
            for (const modelCfg of cfg.models) {
              const modelKey: ModelKey = `${name}/${modelCfg.id}`;
              const model: Model<any> = {
                id: modelCfg.id,
                api: cfg.api,
                baseUrl: cfg.baseUrl,
                provider: name,
                headers: cfg.headers,
                name: modelCfg.name ?? modelCfg.id,
                reasoning: modelCfg.reasoning ?? false,
                input: modelCfg.input ?? ["text"],
                cost: modelCfg.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: modelCfg.contextWindow ?? 128000,
                maxTokens: modelCfg.maxTokens ?? 16384,
              };
              this.loadedModels.set(modelKey, model);
            }
          }
        }
      }
    } catch {
      // models.json does not exist, skip
    }
  }

  public resolveModel(providerId: string, modelId: string) {
    return this.loadedModels.get(`${providerId}/${modelId}`);
  }

  public resolveApiKey(providerId: string) {
    return this.customProvider.get(providerId)?.apiKey;
  }

  public getAvailableModels(): Model<any>[] {
    return [...this.loadedModels.values()];
  }
}
