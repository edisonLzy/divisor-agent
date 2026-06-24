import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import type { Api, Model, OAuthProviderInterface } from "@earendil-works/pi-ai";

import type {
  ModelsConfigFile,
  ModelsConfigPayload,
  ModelDefinitionConfig,
  ProviderDefinitionConfig,
} from "../../shared/models-ipc.js";

export interface CustomModel extends Omit<ModelDefinitionConfig, "compat"> {
  compat?: Model<Api>["compat"];
}

export interface CustomProvider extends Omit<ProviderDefinitionConfig, "api" | "oauth" | "models"> {
  api: Api;
  /** OAuth provider for /login support */
  oauth?: Omit<OAuthProviderInterface, "id">;
  models?: CustomModel[];
}

export interface CustomProvidersConfig extends ModelsConfigFile {
  providers?: Record<string, CustomProvider>;
}

type ModelKey = `${string}/${string}`;

export class ModelRegistry {
  private readonly configPath = resolve(homedir(), ".pi", "agent", "models.json");
  private customProvider = new Map<string, CustomProvider>();
  private loadedModels = new Map<ModelKey, Model<any>>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.reload();
  }

  private normalizeConfig(config: ModelsConfigFile): ModelsConfigFile {
    return {
      providers: config.providers ?? {},
    };
  }

  private cloneConfig(config: ModelsConfigFile): ModelsConfigFile {
    return JSON.parse(JSON.stringify(this.normalizeConfig(config))) as ModelsConfigFile;
  }

  private applyConfig(config: CustomProvidersConfig) {
    this.customProvider.clear();
    this.loadedModels.clear();

    if (!config.providers) {
      return;
    }

    for (const [name, cfg] of Object.entries(config.providers)) {
      this.customProvider.set(name, cfg);

      if (!cfg.models) {
        continue;
      }

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

  private async readConfigFromDisk(): Promise<CustomProvidersConfig> {
    try {
      const content = await readFile(this.configPath, {
        encoding: "utf-8",
      });
      return this.normalizeConfig(JSON.parse(content) as ModelsConfigFile) as CustomProvidersConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.normalizeConfig({}) as CustomProvidersConfig;
      }

      throw error;
    }
  }

  public async reload() {
    const config = await this.readConfigFromDisk();
    this.applyConfig(config);
  }

  public async getConfig(): Promise<ModelsConfigPayload> {
    await this.ready;

    const config = await this.readConfigFromDisk();
    return {
      configPath: this.configPath,
      config: this.cloneConfig(config),
    };
  }

  public async saveConfig(config: ModelsConfigFile) {
    const normalizedConfig = this.normalizeConfig(config);

    await mkdir(dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`, "utf-8");

    this.applyConfig(normalizedConfig as CustomProvidersConfig);
    this.ready = Promise.resolve();
  }

  public resolveModel(providerId: string, modelId: string) {
    return this.loadedModels.get(`${providerId}/${modelId}`);
  }

  public resolveApiKey(providerId: string) {
    return this.customProvider.get(providerId)?.apiKey;
  }

  public async getAvailableModels(): Promise<Model<any>[]> {
    await this.ready;
    return [...this.loadedModels.values()];
  }
}
