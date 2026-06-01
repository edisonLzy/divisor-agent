export interface AvailableModel {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
}

export interface ModelCostConfig {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelDefinitionConfig {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  cost?: ModelCostConfig;
  contextWindow?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  compat?: unknown;
}

export interface ProviderDefinitionConfig {
  baseUrl: string;
  apiKey: string;
  api: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  oauth?: unknown;
  models?: ModelDefinitionConfig[];
}

export interface ModelsConfigFile {
  providers?: Record<string, ProviderDefinitionConfig>;
}

export interface ModelsConfigPayload {
  configPath: string;
  config: ModelsConfigFile;
}

export interface AgentModelsIPC {
  // Sets the model for a given session. Returns true on success, false on failure.
  setModel: (
    sessionId: string,
    model: Pick<AvailableModel, "modelId" | "providerId">,
  ) => Promise<boolean>;
  // get all available models to the renderer process
  getAvailableModels: () => Promise<AvailableModel[]>;
  // read current on-disk models.json configuration
  getModelConfig: () => Promise<ModelsConfigPayload>;
  // persist models.json configuration and reload registry
  saveModelConfig: (config: ModelsConfigFile) => Promise<void>;
}
