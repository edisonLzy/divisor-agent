import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ModelInfo } from './types.js';

const MODELS_JSON_PATH = path.join(os.homedir(), '.pi', 'agent', 'models.json');

interface ModelsJsonModel {
  id: string;
  name?: string;
}

interface ModelsJsonProvider {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: ModelsJsonModel[];
}

interface ModelsJsonConfig {
  providers?: Record<string, ModelsJsonProvider>;
}

const BUILT_IN_MODELS: ModelInfo[] = [
  {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    modelName: 'Claude Sonnet 4',
    isBuiltIn: true,
    api: 'anthropic-messages',
  },
  {
    providerId: 'anthropic',
    modelId: 'claude-opus-4-5',
    modelName: 'Claude Opus 4.5',
    isBuiltIn: true,
    api: 'anthropic-messages',
  },
];

async function readModelsJson(): Promise<ModelsJsonConfig> {
  try {
    const content = await fs.readFile(MODELS_JSON_PATH, 'utf-8');
    return JSON.parse(content) as ModelsJsonConfig;
  } catch {
    return {};
  }
}

export async function listModels(): Promise<ModelInfo[]> {
  const config = await readModelsJson();
  const customModels: ModelInfo[] = [];

  if (config.providers) {
    for (const [providerId, provider] of Object.entries(config.providers)) {
      if (!provider.models?.length) continue;

      for (const model of provider.models) {
        customModels.push({
          providerId,
          modelId: model.id,
          modelName: model.name ?? model.id,
          isBuiltIn: false,
          baseUrl: provider.baseUrl,
          api: provider.api,
          // Strip apiKey from the response – only used server-side
        });
      }
    }
  }

  return [...BUILT_IN_MODELS, ...customModels];
}

/** Resolve the full provider config (including apiKey) for a custom model. */
export async function resolveCustomModelConfig(
  providerId: string,
  modelId: string,
): Promise<{ baseUrl: string; apiKey: string; api: string } | null> {
  const config = await readModelsJson();
  const provider = config.providers?.[providerId];
  if (!provider || !provider.baseUrl || !provider.apiKey || !provider.api) {
    return null;
  }
  const modelExists = provider.models?.some(m => m.id === modelId);
  if (!modelExists) return null;

  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    api: provider.api,
  };
}
