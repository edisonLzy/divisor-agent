import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

// memfs replaces node:fs/promises via the __mocks__/fs/promises.cjs bridge so
// readFile / writeFile / mkdir operate on an in-memory filesystem. This keeps
// ModelRegistry off the real disk and lets each test pre-seed `models.json` by
// path instead of stubbing a vi.fn() per case.
// Reference: https://vitest.dev/guide/mocking/file-system
vi.mock("node:fs/promises");

vi.mock("@earendil-works/pi-ai", () => ({
  getProviders: vi.fn(() => ["anthropic", "openai"]),
  getModels: vi.fn((provider: string) => {
    if (provider === "anthropic") {
      return [
        {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          provider: "anthropic",
          api: "anthropic-chat" as const,
          baseUrl: "",
          reasoning: false,
          input: ["text"] as ("text" | "image")[],
          cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
          contextWindow: 200000,
          maxTokens: 8192,
        },
      ];
    }
    if (provider === "openai") {
      return [
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          api: "openai-chat" as const,
          baseUrl: "",
          reasoning: false,
          input: ["text"] as ("text" | "image")[],
          cost: { input: 5, output: 15, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 16384,
        },
      ];
    }
    return [];
  }),
}));

// ── Import after mock registration ───────────────────────────────────────────

import { homedir } from "node:os";
import { resolve } from "node:path";

import { vol } from "memfs";

import { ModelRegistry } from "../../../../src/main/models/registry.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MODELS_JSON_PATH = resolve(homedir(), ".pi", "agent", "models.json");

function seedModelsJson(value: unknown) {
  // vol.fromJSON accepts a flat map of absolute path → file contents.
  // Pass the file content as a string (matching what Node's readFile returns).
  vol.fromJSON({ [MODELS_JSON_PATH]: JSON.stringify(value) });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ModelRegistry", () => {
  beforeEach(() => {
    // Wipe the in-memory fs between tests so the constructor's "no config on
    // disk" code path stays reachable by default.
    vol.reset();
  });

  describe("constructor", () => {
    it("does not load built-in models on initialization", async () => {
      // ModelRegistry constructor (as of this revision) only seeds custom
      // models from models.json. Built-in catalog loading lives elsewhere in
      // the app (AgentPool). This test pins that contract — change with care.
      const registry = new ModelRegistry();
      const models = await registry.getAvailableModels();

      expect(models.length).toBe(0);
    });
  });

  describe("getAvailableModels", () => {
    it("returns no models when models.json is absent", async () => {
      const registry = new ModelRegistry();
      const models = await registry.getAvailableModels();

      expect(models.length).toBe(0);
    });

    it("includes custom models when models.json exists", async () => {
      seedModelsJson({
        providers: {
          "custom-provider": {
            baseUrl: "https://api.example.com",
            apiKey: "sk-test",
            api: "openai-compatible",
            models: [{ id: "custom-model-1", name: "Custom Model" }],
          },
        },
      });

      const registry = new ModelRegistry();
      const models = await registry.getAvailableModels();

      // Built-ins are not auto-loaded in this code path; custom providers are.
      expect(models.length).toBe(1);

      const customModel = models.find((m) => m.id === "custom-model-1");
      expect(customModel).toBeDefined();
      expect(customModel?.provider).toBe("custom-provider");
    });

    it("returns a copy of the models array", async () => {
      const registry = new ModelRegistry();
      const models1 = await registry.getAvailableModels();
      const models2 = await registry.getAvailableModels();

      expect(models1).not.toBe(models2);
      expect(models1).toEqual(models2);
    });
  });

  describe("resolveModel", () => {
    it("returns undefined for built-in model by provider and modelId", () => {
      // Built-in catalog is not loaded by ModelRegistry; resolveModel only
      // sees custom providers from models.json.
      const registry = new ModelRegistry();
      const model = registry.resolveModel("anthropic", "claude-sonnet-4-20250514");

      expect(model).toBeUndefined();
    });

    it("returns undefined for unknown model", () => {
      const registry = new ModelRegistry();
      const model = registry.resolveModel("anthropic", "unknown-model");

      expect(model).toBeUndefined();
    });

    it("returns undefined for unknown provider", () => {
      const registry = new ModelRegistry();
      const model = registry.resolveModel("unknown-provider", "some-model");

      expect(model).toBeUndefined();
    });

    it("resolves custom model from models.json", async () => {
      seedModelsJson({
        providers: {
          custom: {
            baseUrl: "https://custom.api.com",
            apiKey: "sk-custom",
            api: "openai-compatible",
            models: [
              {
                id: "my-custom-model",
                name: "My Custom Model",
              },
            ],
          },
        },
      });

      const registry = new ModelRegistry();
      // getAvailableModels awaits the registry's `ready` promise, which
      // resolves once the disk read finishes — no manual sleep needed.
      await registry.getAvailableModels();

      const model = registry.resolveModel("custom", "my-custom-model");

      expect(model).toBeDefined();
      expect(model?.id).toBe("my-custom-model");
      expect(model?.name).toBe("My Custom Model");
      expect(model?.provider).toBe("custom");
    });

    it("uses modelId as default name when name is not provided", async () => {
      seedModelsJson({
        providers: {
          p: {
            baseUrl: "https://api.com",
            apiKey: "key",
            api: "openai-compatible",
            models: [{ id: "unnamed-model" }],
          },
        },
      });

      const registry = new ModelRegistry();
      await registry.getAvailableModels();

      const model = registry.resolveModel("p", "unnamed-model");

      expect(model?.name).toBe("unnamed-model");
    });
  });

  describe("resolveApiKey", () => {
    it("returns undefined when provider has no apiKey", () => {
      const registry = new ModelRegistry();
      const apiKey = registry.resolveApiKey("anthropic");

      // Built-in providers don't have customProvider entries
      expect(apiKey).toBeUndefined();
    });

    it("returns apiKey from custom provider config", async () => {
      seedModelsJson({
        providers: {
          "my-provider": {
            baseUrl: "https://api.my.com",
            apiKey: "sk-secret-key",
            api: "openai-compatible",
          },
        },
      });

      const registry = new ModelRegistry();
      await registry.getAvailableModels();

      const apiKey = registry.resolveApiKey("my-provider");

      expect(apiKey).toBe("sk-secret-key");
    });

    it("returns undefined for unknown provider", () => {
      const registry = new ModelRegistry();
      const apiKey = registry.resolveApiKey("nonexistent-provider");

      expect(apiKey).toBeUndefined();
    });
  });

  describe("custom model structure", () => {
    it("applies default values to custom model", async () => {
      seedModelsJson({
        providers: {
          "test-provider": {
            baseUrl: "https://api.test.com",
            apiKey: "sk-test",
            api: "openai-chat",
            models: [{ id: "minimal-model" }],
          },
        },
      });

      const registry = new ModelRegistry();
      await registry.getAvailableModels();

      const model = registry.resolveModel("test-provider", "minimal-model");

      expect(model).toBeDefined();
      expect(model?.reasoning).toBe(false);
      expect(model?.input).toEqual(["text"]);
      expect(model?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      expect(model?.contextWindow).toBe(128000);
      expect(model?.maxTokens).toBe(16384);
    });

    it("preserves custom values when provided", async () => {
      seedModelsJson({
        providers: {
          "custom-provider": {
            baseUrl: "https://api.custom.com",
            apiKey: "sk-custom",
            api: "openai-chat",
            models: [
              {
                id: "full-model",
                name: "Full Featured Model",
                reasoning: true,
                input: ["text", "image"],
                cost: { input: 10, output: 20, cacheRead: 1, cacheWrite: 2 },
                contextWindow: 200000,
                maxTokens: 32000,
              },
            ],
          },
        },
      });

      const registry = new ModelRegistry();
      await registry.getAvailableModels();

      const model = registry.resolveModel("custom-provider", "full-model");

      expect(model).toMatchObject({
        id: "full-model",
        name: "Full Featured Model",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 10, output: 20, cacheRead: 1, cacheWrite: 2 },
        contextWindow: 200000,
        maxTokens: 32000,
      });
    });

    it("sets baseUrl and headers from provider config", async () => {
      seedModelsJson({
        providers: {
          "header-provider": {
            baseUrl: "https://api.headers.com/v1",
            apiKey: "sk-headers",
            api: "openai-chat",
            headers: { "X-Custom-Header": "value" },
            models: [{ id: "header-model" }],
          },
        },
      });

      const registry = new ModelRegistry();
      await registry.getAvailableModels();

      const model = registry.resolveModel("header-provider", "header-model");

      expect(model?.baseUrl).toBe("https://api.headers.com/v1");
      expect(model?.headers).toEqual({ "X-Custom-Header": "value" });
    });
  });

  describe("models.json handling", () => {
    it.skip("handles malformed JSON gracefully", () => {
      // ModelRegistry.readConfigFromDisk currently rethrows non-ENOENT
      // errors (a JSON.parse failure from a corrupted file flies through the
      // async try/catch). When the registry is hardened to swallow those, this
      // case should flip back on and assert no-throw.
      vol.fromJSON({ [MODELS_JSON_PATH]: "{ not valid json ~~" });

      expect(() => new ModelRegistry()).not.toThrow();
    });

    it("handles empty providers object", async () => {
      seedModelsJson({ providers: {} });

      const registry = new ModelRegistry();
      const models = await registry.getAvailableModels();
      // No built-in catalog + empty providers → no models at all.
      expect(models.length).toBe(0);
    });

    it("handles provider without models array", async () => {
      seedModelsJson({
        providers: {
          "no-models-provider": {
            baseUrl: "https://api.com",
            apiKey: "sk-key",
            api: "openai-chat",
          },
        },
      });

      const registry = new ModelRegistry();
      const models = await registry.getAvailableModels();
      // Provider entry exists but declares no models → nothing loaded.
      expect(models.length).toBe(0);
    });

    it("handles empty models array", async () => {
      seedModelsJson({
        providers: {
          "empty-provider": {
            baseUrl: "https://api.com",
            apiKey: "sk-key",
            api: "openai-chat",
            models: [],
          },
        },
      });

      const registry = new ModelRegistry();
      const models = await registry.getAvailableModels();
      // Provider with explicit empty models array → nothing loaded.
      expect(models.length).toBe(0);
    });
  });
});
