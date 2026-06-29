import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { ModelRegistry } from "../../../../src/main/models/registry.js";

const ENOENT = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

describe("ModelRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFile).mockRejectedValue(ENOENT);
  });

  it("returns no models when models.json is absent", async () => {
    const registry = new ModelRegistry();

    await expect(registry.getAvailableModels()).resolves.toEqual([]);
  });

  it("loads models and API keys from models.json", async () => {
    vi.mocked(readFile).mockResolvedValue(createConfig());
    const registry = new ModelRegistry();

    const models = await registry.getAvailableModels();

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: "model-1",
      name: "Model One",
      provider: "provider-1",
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 16384,
    });
    expect(registry.resolveApiKey("provider-1")).toBe("secret");
  });

  it("resolves a loaded model by provider and model id", async () => {
    vi.mocked(readFile).mockResolvedValue(createConfig());
    const registry = new ModelRegistry();
    await registry.getAvailableModels();

    expect(registry.resolveModel("provider-1", "model-1")?.name).toBe("Model One");
    expect(registry.resolveModel("provider-1", "missing")).toBeUndefined();
  });

  it("returns a new models array for each read", async () => {
    vi.mocked(readFile).mockResolvedValue(createConfig());
    const registry = new ModelRegistry();

    const first = await registry.getAvailableModels();
    const second = await registry.getAvailableModels();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("uses model defaults when optional values are absent", async () => {
    vi.mocked(readFile).mockResolvedValue(createConfig({ name: undefined }));
    const registry = new ModelRegistry();

    const [model] = await registry.getAvailableModels();

    expect(model).toMatchObject({
      name: "model-1",
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 16384,
    });
  });

  it("persists normalized config and reloads the registry", async () => {
    const registry = new ModelRegistry();
    await registry.getAvailableModels();

    await registry.saveConfig(JSON.parse(createConfig()));

    expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("models.json"),
      expect.stringContaining('"provider-1"'),
      "utf-8",
    );
    expect(registry.resolveModel("provider-1", "model-1")).toBeDefined();
  });

  it("returns a cloned config payload", async () => {
    vi.mocked(readFile).mockResolvedValue(createConfig());
    const registry = new ModelRegistry();

    const payload = await registry.getConfig();

    expect(payload.configPath).toContain("models.json");
    expect(payload.config.providers?.["provider-1"]?.apiKey).toBe("secret");
  });

  it("surfaces malformed models.json", async () => {
    vi.mocked(readFile).mockResolvedValue("{ malformed");
    const registry = new ModelRegistry();

    await expect(registry.getAvailableModels()).rejects.toBeInstanceOf(SyntaxError);
  });
});

function createConfig(modelOverrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    providers: {
      "provider-1": {
        api: "openai-chat",
        apiKey: "secret",
        baseUrl: "https://example.com",
        models: [
          {
            id: "model-1",
            name: "Model One",
            ...modelOverrides,
          },
        ],
      },
    },
  });
}
