import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
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

import { readFile } from "node:fs/promises";

import { ModelRegistry } from "../../../../src/main/models/registry.js";

// ── Constants ────────────────────────────────────────────────────────────────

const ENOENT = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ModelRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFile).mockRejectedValue(ENOENT);
  });

  describe("constructor", () => {
    it("loads built-in models on initialization", () => {
      const registry = new ModelRegistry();
      const models = registry.getAvailableModels();

      expect(models.length).toBeGreaterThan(0);
    });

    it("loads models from all built-in providers", () => {
      const registry = new ModelRegistry();
      const models = registry.getAvailableModels();

      // Should have anthropic and openai models from mock
      expect(models.length).toBe(2);
    });
  });

  describe("getAvailableModels", () => {
    it("returns only built-in models when models.json is absent", () => {
      const registry = new ModelRegistry();
      const models = registry.getAvailableModels();

      // Should have anthropic and openai models from mock
      expect(models.length).toBe(2);
    });

    it("includes custom models when models.json exists", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            "custom-provider": {
              baseUrl: "https://api.example.com",
              apiKey: "sk-test",
              api: "openai-compatible",
              models: [{ id: "custom-model-1", name: "Custom Model" }],
            },
          },
        }),
      );

      // Note: loadCustomModels is called in constructor but is async and not awaited
      // So we need to wait for the next tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const models = registry.getAvailableModels();

      // Should have 2 built-in + 1 custom = 3
      expect(models.length).toBe(3);

      const customModel = models.find((m) => m.id === "custom-model-1");
      expect(customModel).toBeDefined();
      expect(customModel?.provider).toBe("custom-provider");
    });

    it("returns a copy of the models array", () => {
      const registry = new ModelRegistry();
      const models1 = registry.getAvailableModels();
      const models2 = registry.getAvailableModels();

      expect(models1).not.toBe(models2);
      expect(models1).toEqual(models2);
    });
  });

  describe("resolveModel", () => {
    it("resolves built-in model by provider and modelId", () => {
      const registry = new ModelRegistry();
      const model = registry.resolveModel("anthropic", "claude-sonnet-4-20250514");

      expect(model).toBeDefined();
      expect(model?.id).toBe("claude-sonnet-4-20250514");
      expect(model?.provider).toBe("anthropic");
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
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
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
        }),
      );

      const registry = new ModelRegistry();
      // Wait for async loadCustomModels to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const model = registry.resolveModel("custom", "my-custom-model");

      expect(model).toBeDefined();
      expect(model?.id).toBe("my-custom-model");
      expect(model?.name).toBe("My Custom Model");
      expect(model?.provider).toBe("custom");
    });

    it("uses modelId as default name when name is not provided", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            p: {
              baseUrl: "https://api.com",
              apiKey: "key",
              api: "openai-compatible",
              models: [{ id: "unnamed-model" }],
            },
          },
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            "my-provider": {
              baseUrl: "https://api.my.com",
              apiKey: "sk-secret-key",
              api: "openai-compatible",
            },
          },
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            "test-provider": {
              baseUrl: "https://api.test.com",
              apiKey: "sk-test",
              api: "openai-chat",
              models: [{ id: "minimal-model" }],
            },
          },
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const model = registry.resolveModel("test-provider", "minimal-model");

      expect(model).toBeDefined();
      expect(model?.reasoning).toBe(false);
      expect(model?.input).toEqual(["text"]);
      expect(model?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      expect(model?.contextWindow).toBe(128000);
      expect(model?.maxTokens).toBe(16384);
    });

    it("preserves custom values when provided", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
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
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

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
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            "header-provider": {
              baseUrl: "https://api.headers.com/v1",
              apiKey: "sk-headers",
              api: "openai-chat",
              headers: { "X-Custom-Header": "value" },
              models: [{ id: "header-model" }],
            },
          },
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const model = registry.resolveModel("header-provider", "header-model");

      expect(model?.baseUrl).toBe("https://api.headers.com/v1");
      expect(model?.headers).toEqual({ "X-Custom-Header": "value" });
    });
  });

  describe("models.json handling", () => {
    it("handles malformed JSON gracefully", async () => {
      vi.mocked(readFile).mockResolvedValue("{ not valid json ~~");

      // Should not throw, just log error
      expect(() => new ModelRegistry()).not.toThrow();
    });

    it("handles empty providers object", async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ providers: {} }));

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const models = registry.getAvailableModels();
      // Should only have built-in models
      expect(models.length).toBe(2);
    });

    it("handles provider without models array", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            "no-models-provider": {
              baseUrl: "https://api.com",
              apiKey: "sk-key",
              api: "openai-chat",
            },
          },
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const models = registry.getAvailableModels();
      // Should only have built-in models
      expect(models.length).toBe(2);
    });

    it("handles empty models array", async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          providers: {
            "empty-provider": {
              baseUrl: "https://api.com",
              apiKey: "sk-key",
              api: "openai-chat",
              models: [],
            },
          },
        }),
      );

      const registry = new ModelRegistry();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const models = registry.getAvailableModels();
      // Should only have built-in models
      expect(models.length).toBe(2);
    });
  });
});
