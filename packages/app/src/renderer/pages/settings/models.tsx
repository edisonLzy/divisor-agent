import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Switch } from "@renderer/components/ui/switch";
import { Textarea } from "@renderer/components/ui/textarea";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { cn } from "@renderer/lib/utils";
import type {
  ModelCostConfig,
  ModelDefinitionConfig,
  ModelsConfigFile,
  ProviderDefinitionConfig,
} from "@shared/models-ipc";
import { Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const EMPTY_MODELS_CONFIG: ModelsConfigFile = { providers: {} };

const DEFAULT_PROVIDER: ProviderDefinitionConfig = {
  api: "openai",
  apiKey: "",
  baseUrl: "",
  authHeader: true,
  models: [],
};

const DEFAULT_MODEL_COST: ModelCostConfig = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const DEFAULT_MODEL: ModelDefinitionConfig = {
  id: "new-model",
  name: "",
  reasoning: false,
  input: ["text"],
  cost: DEFAULT_MODEL_COST,
  contextWindow: 128000,
  maxTokens: 16384,
};

export function SettingsModelsPage() {
  const { invoke } = useElectronIPC();

  const [configPath, setConfigPath] = useState("~/.pi/agent/models.json");
  const [modelsConfig, setModelsConfig] = useState<ModelsConfigFile>(EMPTY_MODELS_CONFIG);
  const [jsonDraft, setJsonDraft] = useState('{\n  "providers": {}\n}');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [providerIdDraft, setProviderIdDraft] = useState("");
  const [modelEditorMode, setModelEditorMode] = useState<"visual" | "json">("visual");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSavingModels, setIsSavingModels] = useState(false);

  const providerEntries = useMemo(() => {
    return Object.entries(modelsConfig.providers ?? {});
  }, [modelsConfig]);

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) {
      return null;
    }

    return (modelsConfig.providers ?? {})[selectedProviderId] ?? null;
  }, [modelsConfig, selectedProviderId]);

  const selectedProviderModels = selectedProvider?.models ?? [];

  const selectedModel = useMemo(() => {
    if (!selectedModelId) {
      return null;
    }

    return selectedProviderModels.find((model) => model.id === selectedModelId) ?? null;
  }, [selectedModelId, selectedProviderModels]);

  const providerCount = providerEntries.length;
  const modelCount = providerEntries.reduce((count, [, provider]) => {
    return count + (provider.models?.length ?? 0);
  }, 0);

  useEffect(() => {
    void loadModelsConfig();
  }, []);

  useEffect(() => {
    if (providerEntries.length === 0) {
      if (selectedProviderId !== null) {
        setSelectedProviderId(null);
      }
      return;
    }

    if (!selectedProviderId || !(modelsConfig.providers ?? {})[selectedProviderId]) {
      setSelectedProviderId(providerEntries[0][0]);
    }
  }, [modelsConfig, providerEntries, selectedProviderId]);

  useEffect(() => {
    setProviderIdDraft(selectedProviderId ?? "");
  }, [selectedProviderId]);

  useEffect(() => {
    if (selectedProviderModels.length === 0) {
      if (selectedModelId !== null) {
        setSelectedModelId(null);
      }
      return;
    }

    if (!selectedModelId || !selectedProviderModels.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(selectedProviderModels[0]?.id ?? null);
    }
  }, [selectedModelId, selectedProviderModels]);

  async function loadModelsConfig() {
    setIsLoadingModels(true);

    try {
      const payload = await invoke("getModelConfig");
      const nextConfig = normalizeModelsConfig(payload.config);

      setConfigPath(payload.configPath);
      setModelsConfig(nextConfig);
      setJsonDraft(serializeJson(nextConfig));
    } catch (error) {
      console.error("Failed to load models config", error);
      toast.error(readModelsConfigErrorMessage(error, "读取模型配置失败"));
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function saveVisualConfig() {
    try {
      validateModelsConfig(modelsConfig);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型配置校验失败");
      return;
    }

    setIsSavingModels(true);

    try {
      await invoke("saveModelConfig", normalizeModelsConfig(modelsConfig));
      toast.success("模型配置已保存");
      await loadModelsConfig();
    } catch (error) {
      console.error("Failed to save models config", error);
      toast.error(readModelsConfigErrorMessage(error, "保存模型配置失败"));
    } finally {
      setIsSavingModels(false);
    }
  }

  async function saveJsonConfig() {
    let parsedConfig: ModelsConfigFile;
    try {
      parsedConfig = normalizeModelsConfig(JSON.parse(jsonDraft) as ModelsConfigFile);
      validateModelsConfig(parsedConfig);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "JSON 配置无效");
      return;
    }

    setIsSavingModels(true);

    try {
      await invoke("saveModelConfig", parsedConfig);
      toast.success("模型配置已保存");
      await loadModelsConfig();
    } catch (error) {
      console.error("Failed to save models json", error);
      toast.error(readModelsConfigErrorMessage(error, "保存模型配置失败"));
    } finally {
      setIsSavingModels(false);
    }
  }

  function updateProvider(
    providerId: string,
    updater: (provider: ProviderDefinitionConfig) => ProviderDefinitionConfig,
  ) {
    setModelsConfig((current) => {
      const providers = { ...(current.providers ?? {}) };
      const existingProvider = providers[providerId];
      if (!existingProvider) {
        return current;
      }

      providers[providerId] = updater(existingProvider);
      return { ...current, providers };
    });
  }

  function updateSelectedModel(updater: (model: ModelDefinitionConfig) => ModelDefinitionConfig) {
    if (!selectedProviderId || !selectedModelId) {
      return;
    }

    updateProvider(selectedProviderId, (provider) => {
      return {
        ...provider,
        models: (provider.models ?? []).map((model) => {
          if (model.id !== selectedModelId) {
            return model;
          }

          return updater(model);
        }),
      };
    });
  }

  function addProvider() {
    const nextProviderId = createUniqueProviderId(modelsConfig.providers ?? {});
    setModelsConfig((current) => {
      return {
        ...current,
        providers: {
          ...(current.providers ?? {}),
          [nextProviderId]: cloneValue(DEFAULT_PROVIDER),
        },
      };
    });
    setSelectedProviderId(nextProviderId);
    setSelectedModelId(null);
  }

  function removeProvider(providerId: string) {
    setModelsConfig((current) => {
      const providers = { ...(current.providers ?? {}) };
      delete providers[providerId];
      return { ...current, providers };
    });
  }

  function renameSelectedProvider() {
    if (!selectedProviderId) {
      return;
    }

    const trimmedId = providerIdDraft.trim();
    if (!trimmedId) {
      setProviderIdDraft(selectedProviderId);
      toast.error("Provider ID 不能为空");
      return;
    }

    if (trimmedId === selectedProviderId) {
      return;
    }

    if ((modelsConfig.providers ?? {})[trimmedId]) {
      setProviderIdDraft(selectedProviderId);
      toast.error("Provider ID 已存在");
      return;
    }

    setModelsConfig((current) => {
      const providers = { ...(current.providers ?? {}) };
      const provider = providers[selectedProviderId];
      if (!provider) {
        return current;
      }

      delete providers[selectedProviderId];
      providers[trimmedId] = provider;

      return {
        ...current,
        providers,
      };
    });
    setSelectedProviderId(trimmedId);
  }

  function addModel() {
    if (!selectedProviderId) {
      return;
    }

    const nextModelId = createUniqueModelId(selectedProvider?.models ?? []);
    updateProvider(selectedProviderId, (provider) => {
      return {
        ...provider,
        models: [...(provider.models ?? []), { ...cloneValue(DEFAULT_MODEL), id: nextModelId }],
      };
    });
    setSelectedModelId(nextModelId);
  }

  function removeModel(modelId: string) {
    if (!selectedProviderId) {
      return;
    }

    updateProvider(selectedProviderId, (provider) => {
      return {
        ...provider,
        models: (provider.models ?? []).filter((model) => model.id !== modelId),
      };
    });
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-320 flex-col px-10 py-12">
      <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground">Models</h1>
      <div className="flex flex-col gap-6">
        <div className="rounded-md border-2 border-border bg-card shadow-[var(--hard-shadow)]">
          <div className="flex flex-col gap-4 border-b-2 border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[13px] font-medium text-foreground">模型配置</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                直接维护当前应用使用的 `models.json`，不再回到 Python 配置文件手改。
              </div>
              <div className="mt-2 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                {configPath}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadModelsConfig()}
                disabled={isLoadingModels || isSavingModels}
              >
                <RefreshCw className={cn("size-3.5", isLoadingModels && "animate-spin")} />
                刷新
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  void (modelEditorMode === "visual" ? saveVisualConfig() : saveJsonConfig())
                }
                disabled={isLoadingModels || isSavingModels}
              >
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-b-2 border-border bg-background px-4 py-4 md:grid-cols-3">
            <div className="rounded-md border-2 border-border bg-card px-3 py-3 shadow-[var(--hard-shadow-sm)]">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Provider
              </div>
              <div className="mt-2 text-[15px] font-medium text-foreground">
                {String(providerCount)}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                当前配置中的模型提供方数量
              </div>
            </div>
            <div className="rounded-md border-2 border-border bg-card px-3 py-3 shadow-[var(--hard-shadow-sm)]">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Model
              </div>
              <div className="mt-2 text-[15px] font-medium text-foreground">
                {String(modelCount)}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                保存后会立即刷新应用内可选模型
              </div>
            </div>
            <div className="rounded-md border-2 border-border bg-card px-3 py-3 shadow-[var(--hard-shadow-sm)]">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                编辑方式
              </div>
              <div className="mt-2 text-[15px] font-medium text-foreground">
                {modelEditorMode === "visual" ? "可视化" : "JSON"}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                常用字段走可视化，高级字段可直接写 JSON
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b-2 border-border px-4 py-4">
            <Button
              type="button"
              size="sm"
              variant={modelEditorMode === "visual" ? "default" : "outline"}
              onClick={() => setModelEditorMode("visual")}
            >
              <Pencil className="size-3.5" />
              可视化编辑
            </Button>
            <Button
              type="button"
              size="sm"
              variant={modelEditorMode === "json" ? "default" : "outline"}
              onClick={() => {
                setJsonDraft(serializeJson(normalizeModelsConfig(modelsConfig)));
                setModelEditorMode("json");
              }}
            >
              JSON 编辑
            </Button>
          </div>

          {modelEditorMode === "visual" ? (
            <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="border-b border-border lg:border-r lg:border-b-0">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-[12px] font-medium text-foreground">Providers</div>
                    <div className="text-[11px] text-muted-foreground">选择一个提供方进行编辑</div>
                  </div>
                  <Button type="button" size="icon-sm" variant="outline" onClick={addProvider}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <div className="space-y-2 px-3 pb-3">
                  {providerEntries.length === 0 && (
                    <EmptyState
                      title="还没有 Provider"
                      description="先新增一个 Provider，再往下添加模型。"
                    />
                  )}
                  {providerEntries.map(([providerId, provider]) => {
                    const isActive = selectedProviderId === providerId;

                    return (
                      <button
                        key={providerId}
                        type="button"
                        onClick={() => setSelectedProviderId(providerId)}
                        className={cn(
                          "flex w-full flex-col rounded-lg border px-3 py-3 text-left transition-colors",
                          isActive
                            ? "border-primary bg-primary/6"
                            : "border-border bg-background hover:bg-muted/50",
                        )}
                      >
                        <span className="truncate text-[12px] font-medium text-foreground">
                          {providerId}
                        </span>
                        <span className="mt-1 truncate text-[11px] text-muted-foreground">
                          {provider.api || "未填写 API 类型"}
                        </span>
                        <span className="mt-2 text-[11px] text-muted-foreground">
                          {(provider.models ?? []).length} models
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4">
                {!selectedProvider || !selectedProviderId ? (
                  <EmptyState
                    title="选择一个 Provider"
                    description="左侧选中 Provider 后，就可以继续配置 API 与模型列表。"
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-lg border border-border bg-background/70 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-medium text-foreground">
                            Provider 配置
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            高级字段如 `headers`、`oauth` 可在 JSON 编辑里直接维护。
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => removeProvider(selectedProviderId)}
                        >
                          <Trash2 className="size-3.5" />
                          删除 Provider
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field
                          label="Provider ID"
                          description="例如 openai、openrouter、siliconflow"
                        >
                          <Input
                            value={providerIdDraft}
                            onChange={(event) => setProviderIdDraft(event.target.value)}
                            onBlur={renameSelectedProvider}
                            placeholder="provider-id"
                          />
                        </Field>
                        <Field label="API 类型" description="写入 provider.api，例如 openai">
                          <Input
                            value={selectedProvider.api}
                            onChange={(event) => {
                              updateProvider(selectedProviderId, (provider) => {
                                return { ...provider, api: event.target.value };
                              });
                            }}
                            placeholder="openai"
                          />
                        </Field>
                        <Field label="Base URL" description="模型服务的接口根地址">
                          <Input
                            value={selectedProvider.baseUrl}
                            onChange={(event) => {
                              updateProvider(selectedProviderId, (provider) => {
                                return { ...provider, baseUrl: event.target.value };
                              });
                            }}
                            placeholder="https://api.openai.com/v1"
                          />
                        </Field>
                        <Field label="API Key" description="支持空值，适用于 OAuth 或稍后补充">
                          <Input
                            value={selectedProvider.apiKey}
                            onChange={(event) => {
                              updateProvider(selectedProviderId, (provider) => {
                                return { ...provider, apiKey: event.target.value };
                              });
                            }}
                            placeholder="sk-..."
                          />
                        </Field>
                      </div>

                      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-3">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">
                            自动注入鉴权 Header
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            关闭后可在 JSON 模式里自行控制 headers。
                          </div>
                        </div>
                        <Switch
                          checked={selectedProvider.authHeader ?? false}
                          onCheckedChange={(checked) => {
                            updateProvider(selectedProviderId, (provider) => {
                              return { ...provider, authHeader: checked };
                            });
                          }}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background/70 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-medium text-foreground">模型列表</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            这里覆盖常用模型字段；复杂兼容项继续放到 JSON 里。
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={addModel}>
                          <Plus className="size-3.5" />
                          新增模型
                        </Button>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                        <div className="space-y-2">
                          {selectedProviderModels.length === 0 && (
                            <EmptyState
                              title="还没有模型"
                              description="新增模型后即可配置 ID、上下文窗口和输出上限。"
                            />
                          )}
                          {selectedProviderModels.map((model) => {
                            const isActive = selectedModelId === model.id;

                            return (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => setSelectedModelId(model.id)}
                                className={cn(
                                  "flex w-full flex-col rounded-lg border px-3 py-3 text-left transition-colors",
                                  isActive
                                    ? "border-primary bg-primary/6"
                                    : "border-border bg-card hover:bg-muted/50",
                                )}
                              >
                                <span className="truncate text-[12px] font-medium text-foreground">
                                  {model.name || model.id}
                                </span>
                                <span className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                  {model.id}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {!selectedModel ? (
                          <EmptyState
                            title="选择一个模型"
                            description="左侧选择模型后，就可以编辑名称、token 上限、输入类型等信息。"
                          />
                        ) : (
                          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[13px] font-medium text-foreground">
                                  模型详情
                                </div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  保存后会立即出现在模型选择器里。
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => removeModel(selectedModel.id)}
                              >
                                <Trash2 className="size-3.5" />
                                删除模型
                              </Button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <Field label="Model ID" description="例如 gpt-4.1、gemini-2.5-pro">
                                <Input
                                  value={selectedModel.id}
                                  onChange={(event) => {
                                    const nextId = event.target.value;
                                    const previousId = selectedModel.id;

                                    updateSelectedModel((model) => {
                                      return { ...model, id: nextId };
                                    });

                                    if (selectedModelId === previousId) {
                                      setSelectedModelId(nextId);
                                    }
                                  }}
                                  placeholder="model-id"
                                />
                              </Field>
                              <Field label="显示名称" description="可选，留空时默认显示 Model ID">
                                <Input
                                  value={selectedModel.name ?? ""}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return { ...model, name: event.target.value };
                                    });
                                  }}
                                  placeholder="GPT-4.1"
                                />
                              </Field>
                              <Field label="Context Window" description="上下文窗口大小">
                                <Input
                                  type="number"
                                  value={selectedModel.contextWindow ?? 128000}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return {
                                        ...model,
                                        contextWindow: readNumber(event.target.value, 128000),
                                      };
                                    });
                                  }}
                                />
                              </Field>
                              <Field label="Max Tokens" description="单次响应最大输出 token">
                                <Input
                                  type="number"
                                  value={selectedModel.maxTokens ?? 16384}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return {
                                        ...model,
                                        maxTokens: readNumber(event.target.value, 16384),
                                      };
                                    });
                                  }}
                                />
                              </Field>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <Field label="输入能力" description="至少选择一种输入能力">
                                <div className="flex flex-wrap gap-2">
                                  {(["text", "image"] as const).map((inputType) => {
                                    const enabled = (selectedModel.input ?? ["text"]).includes(
                                      inputType,
                                    );

                                    return (
                                      <Button
                                        key={inputType}
                                        type="button"
                                        size="sm"
                                        variant={enabled ? "default" : "outline"}
                                        onClick={() => {
                                          updateSelectedModel((model) => {
                                            const nextInput = toggleInputCapability(
                                              model.input ?? ["text"],
                                              inputType,
                                            );
                                            return { ...model, input: nextInput };
                                          });
                                        }}
                                      >
                                        {inputType}
                                      </Button>
                                    );
                                  })}
                                </div>
                              </Field>
                              <Field label="Reasoning" description="标记该模型是否支持推理模式">
                                <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3">
                                  <span className="text-[12px] text-foreground">
                                    {selectedModel.reasoning ? "已启用" : "未启用"}
                                  </span>
                                  <Switch
                                    checked={selectedModel.reasoning ?? false}
                                    onCheckedChange={(checked) => {
                                      updateSelectedModel((model) => {
                                        return { ...model, reasoning: checked };
                                      });
                                    }}
                                  />
                                </div>
                              </Field>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <Field label="输入成本" description="cost.input">
                                <Input
                                  type="number"
                                  value={selectedModel.cost?.input ?? 0}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return {
                                        ...model,
                                        cost: {
                                          ...(model.cost ?? cloneValue(DEFAULT_MODEL_COST)),
                                          input: readNumber(event.target.value, 0),
                                        },
                                      };
                                    });
                                  }}
                                />
                              </Field>
                              <Field label="输出成本" description="cost.output">
                                <Input
                                  type="number"
                                  value={selectedModel.cost?.output ?? 0}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return {
                                        ...model,
                                        cost: {
                                          ...(model.cost ?? cloneValue(DEFAULT_MODEL_COST)),
                                          output: readNumber(event.target.value, 0),
                                        },
                                      };
                                    });
                                  }}
                                />
                              </Field>
                              <Field label="缓存读取" description="cost.cacheRead">
                                <Input
                                  type="number"
                                  value={selectedModel.cost?.cacheRead ?? 0}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return {
                                        ...model,
                                        cost: {
                                          ...(model.cost ?? cloneValue(DEFAULT_MODEL_COST)),
                                          cacheRead: readNumber(event.target.value, 0),
                                        },
                                      };
                                    });
                                  }}
                                />
                              </Field>
                              <Field label="缓存写入" description="cost.cacheWrite">
                                <Input
                                  type="number"
                                  value={selectedModel.cost?.cacheWrite ?? 0}
                                  onChange={(event) => {
                                    updateSelectedModel((model) => {
                                      return {
                                        ...model,
                                        cost: {
                                          ...(model.cost ?? cloneValue(DEFAULT_MODEL_COST)),
                                          cacheWrite: readNumber(event.target.value, 0),
                                        },
                                      };
                                    });
                                  }}
                                />
                              </Field>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="rounded-lg border border-border bg-background/70 p-4">
                <div className="text-[13px] font-medium text-foreground">完整 JSON</div>
                <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  适合直接维护 `headers`、`oauth`、`compat` 等高级字段。保存时会先做基础结构校验。
                </div>
              </div>
              <Textarea
                value={jsonDraft}
                onChange={(event) => setJsonDraft(event.target.value)}
                className="min-h-[560px] font-mono text-[12px] leading-6"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeModelsConfig(config: ModelsConfigFile): ModelsConfigFile {
  return {
    providers: Object.fromEntries(
      Object.entries(config.providers ?? {}).map(([providerId, provider]) => {
        return [
          providerId,
          {
            ...provider,
            models: (provider.models ?? []).map((model) => {
              return {
                ...model,
                input: model.input && model.input.length > 0 ? model.input : ["text"],
                cost: {
                  ...cloneValue(DEFAULT_MODEL_COST),
                  ...(model.cost ?? {}),
                },
                contextWindow: model.contextWindow ?? 128000,
                maxTokens: model.maxTokens ?? 16384,
              };
            }),
          },
        ];
      }),
    ),
  };
}

function validateModelsConfig(config: ModelsConfigFile) {
  const providers = config.providers ?? {};

  for (const [providerId, provider] of Object.entries(providers)) {
    if (!providerId.trim()) {
      throw new Error("存在空的 Provider ID");
    }

    if (!provider.api.trim()) {
      throw new Error(`Provider "${providerId}" 缺少 API 类型`);
    }

    if (!provider.baseUrl.trim()) {
      throw new Error(`Provider "${providerId}" 缺少 Base URL`);
    }

    const modelIds = new Set<string>();
    for (const model of provider.models ?? []) {
      if (!model.id.trim()) {
        throw new Error(`Provider "${providerId}" 中存在空的 Model ID`);
      }

      if (modelIds.has(model.id)) {
        throw new Error(`Provider "${providerId}" 中存在重复的 Model ID: ${model.id}`);
      }

      modelIds.add(model.id);
    }
  }
}

function createUniqueProviderId(providers: Record<string, ProviderDefinitionConfig>) {
  let index = Object.keys(providers).length + 1;
  let candidate = `provider-${index}`;

  while (providers[candidate]) {
    index += 1;
    candidate = `provider-${index}`;
  }

  return candidate;
}

function createUniqueModelId(models: ModelDefinitionConfig[]) {
  let index = models.length + 1;
  let candidate = `model-${index}`;

  while (models.some((model) => model.id === candidate)) {
    index += 1;
    candidate = `model-${index}`;
  }

  return candidate;
}

function readNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeJson(value: ModelsConfigFile) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toggleInputCapability(
  input: ("text" | "image")[],
  capability: "text" | "image",
): ("text" | "image")[] {
  const next: ("text" | "image")[] = input.includes(capability)
    ? input.filter((item): item is "text" | "image" => item !== capability)
    : [...input, capability];

  return next.length > 0 ? next : ["text"];
}

function readModelsConfigErrorMessage(error: unknown, fallback: string) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : fallback;

  if (
    message.includes("No handler registered") ||
    message.includes("IPC channel not allowed") ||
    message.includes("getModelConfig") ||
    message.includes("saveModelConfig")
  ) {
    return "Models IPC 还没有生效，请重启 Electron App 后再试";
  }

  return `${fallback}: ${message}`;
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <div>
        <div className="text-[12px] font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</div>
      </div>
      {children}
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-center">
      <div className="text-[12px] font-medium text-foreground">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}
