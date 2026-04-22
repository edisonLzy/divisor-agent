import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getModels, getProviders } from '@mariozechner/pi-ai';
import type { Model, Api, KnownProvider } from '@mariozechner/pi-ai';

export interface CustomModelConfig {
  id: string;
  provider: string;
  name?: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  reasoning?: boolean;
  input?: ('text' | 'image')[];
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  contextWindow?: number;
  maxTokens?: number;
}

interface ModelsJsonConfig {
  providers?: Record<
    string,
    {
      baseUrl?: string;
      apiKey?: string;
      api?: string;
      headers?: Record<string, string>;
    }
  >;
  models?: CustomModelConfig[];
  defaultModel?: { provider: string; modelId: string };
}

export class ModelRegistry {
  private builtInProviders = new Map<string, Model<any>[]>();
  private customModels = new Map<string, Model<any>>();
  private providerConfigs = new Map<
    string,
    { baseUrl?: string; apiKey?: string; api?: string }
  >();

  constructor() {
    this.loadBuiltInModels();
  }

  private loadBuiltInModels(): void {
    const providers = getProviders();
    for (const provider of providers) {
      const models = getModels(provider);
      if (models) {
        this.builtInProviders.set(provider, [...models]);
      }
    }
  }

  async loadCustomModels(): Promise<void> {
    try {
      const configPath = resolve(process.env.HOME ?? '/tmp', '.pi', 'agent', 'models.json');
      const content = await readFile(configPath, 'utf-8');
      const config: ModelsJsonConfig = JSON.parse(content);

      if (config.providers) {
        for (const [name, cfg] of Object.entries(config.providers)) {
          this.providerConfigs.set(name, cfg);
        }
      }

      if (config.models) {
        for (const modelCfg of config.models) {
          const model = this.toModel(modelCfg);
          this.customModels.set(`${modelCfg.provider}/${modelCfg.id}`, model);
        }
      }
    } catch {
      // models.json 不存在，跳过
    }
  }

  private toModel(cfg: CustomModelConfig): Model<any> {
    return {
      id: cfg.id,
      name: cfg.name || cfg.id,
      provider: cfg.provider,
      api: (cfg.api as Api) || 'openai-chat',
      baseUrl: cfg.baseUrl || '',
      reasoning: cfg.reasoning || false,
      input: cfg.input || ['text'],
      cost: cfg.cost
        ? {
          input: cfg.cost.input,
          output: cfg.cost.output,
          cacheRead: cfg.cost.cacheRead ?? 0,
          cacheWrite: cfg.cost.cacheWrite ?? 0,
        }
        : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: cfg.contextWindow || 128000,
      maxTokens: cfg.maxTokens || 8192,
    };
  }

  getAvailableModels(): Model<any>[] {
    const result: Model<any>[] = [];
    for (const models of this.builtInProviders.values()) {
      result.push(...models);
    }
    result.push(...this.customModels.values());
    return result;
  }

  getModelsByProvider(provider: string): Model<any>[] {
    const builtIn = this.builtInProviders.get(provider) || [];
    const custom = this.getCustomModelsByProvider(provider);
    return [...builtIn, ...custom];
  }

  private getCustomModelsByProvider(provider: string): Model<any>[] {
    const result: Model<any>[] = [];
    for (const [key, model] of this.customModels) {
      if (key.startsWith(`${provider}/`)) {
        result.push(model);
      }
    }
    return result;
  }

  getBuiltInProviders(): KnownProvider[] {
    return getProviders();
  }

  resolveModel(provider: string, modelId: string): Model<any> | null {
    const builtIn = this.builtInProviders.get(provider);
    if (builtIn) {
      const found = builtIn.find((m) => m.id === modelId);
      if (found) return found;
    }
    return this.customModels.get(`${provider}/${modelId}`) || null;
  }

  resolveApiKey(provider: string, model?: Model<any>): string | null {
    if (model && this.customModels.has(`${provider}/${model.id}`)) {
      const cfg = this.getCustomModelConfig(provider, model.id);
      if (cfg?.apiKey) return this.resolveSecret(cfg.apiKey);
    }

    const providerCfg = this.providerConfigs.get(provider);
    if (providerCfg?.apiKey) {
      return this.resolveSecret(providerCfg.apiKey);
    }

    return this.getEnvApiKey(provider);
  }

  private resolveSecret(value: string): string | null {
    if (value.startsWith('env:')) {
      return process.env[value.slice(4)] || null;
    }
    return value;
  }

  private getEnvApiKey(provider: string): string | null {
    const envMap: Record<string, string[]> = {
      anthropic: ['ANTHROPIC_API_KEY'],
      openai: ['OPENAI_API_KEY'],
      google: ['GOOGLE_API_KEY'],
      openrouter: ['OPENROUTER_API_KEY'],
      minimax: ['MINIMAX_API_KEY'],
    };
    const envVars = envMap[provider] || ['API_KEY'];
    for (const envVar of envVars) {
      if (process.env[envVar]) return process.env[envVar] || null;
    }
    return null;
  }

  private getCustomModelConfig(
    _provider: string,
    _modelId: string,
  ): CustomModelConfig | null {
    // TODO: 需要缓存原始配置
    return null;
  }

  async refresh(): Promise<void> {
    this.customModels.clear();
    this.providerConfigs.clear();
    await this.loadCustomModels();
  }
}

export const modelRegistry = new ModelRegistry();
