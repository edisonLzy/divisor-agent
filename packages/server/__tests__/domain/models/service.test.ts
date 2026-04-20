import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── fs/promises mock ──────────────────────────────────────────────────────

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ default: mockFs }));

// ── Import service AFTER mock is registered ───────────────────────────────

import { listModels, resolveCustomModelConfig } from '../../../src/domain/models/service.js';

// ── Constants ─────────────────────────────────────────────────────────────

const BUILT_IN_COUNT = 2; // claude-sonnet-4-20250514, claude-opus-4-5

const ENOENT = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

// ── Tests ─────────────────────────────────────────────────────────────────

describe('models/service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: models.json absent
    mockFs.readFile.mockRejectedValue(ENOENT);
  });

  describe('listModels', () => {
    it('returns only built-in models when models.json is absent', async () => {
      const models = await listModels();

      expect(models).toHaveLength(BUILT_IN_COUNT);
      expect(models.every(m => m.isBuiltIn)).toBe(true);
    });

    it('built-in models have required fields', async () => {
      const models = await listModels();

      for (const m of models) {
        expect(m.providerId).toBe('anthropic');
        expect(m.modelId).toBeDefined();
        expect(m.modelName).toBeDefined();
        expect(m.api).toBeDefined();
      }
    });

    it('returns built-in + custom models from models.json', async () => {
      const config = {
        providers: {
          'my-provider': {
            baseUrl: 'https://api.example.com',
            api: 'openai-compatible',
            apiKey: 'sk-test',
            models: [
              { id: 'custom-model-1', name: 'Custom Model 1' },
              { id: 'custom-model-2' },
            ],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const models = await listModels();

      expect(models).toHaveLength(BUILT_IN_COUNT + 2);

      const custom = models.filter(m => !m.isBuiltIn);
      expect(custom).toHaveLength(2);
      expect(custom[0]).toMatchObject({
        providerId: 'my-provider',
        modelId: 'custom-model-1',
        modelName: 'Custom Model 1',
        isBuiltIn: false,
        baseUrl: 'https://api.example.com',
        api: 'openai-compatible',
      });
    });

    it('does not expose apiKey in listed models', async () => {
      const config = {
        providers: {
          'secret-provider': {
            baseUrl: 'https://api.secret.com',
            api: 'openai-compatible',
            apiKey: 'sk-super-secret',
            models: [{ id: 'model-x' }],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const models = await listModels();
      const custom = models.find(m => m.modelId === 'model-x');

      expect(custom).toBeDefined();
      expect((custom as unknown as Record<string, unknown>)['apiKey']).toBeUndefined();
    });

    it('falls back to modelId as modelName when name is absent', async () => {
      const config = {
        providers: {
          'p': {
            baseUrl: 'https://api.com',
            api: 'openai-compatible',
            apiKey: 'key',
            models: [{ id: 'unnamed-model' }],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const models = await listModels();
      const custom = models.find(m => m.modelId === 'unnamed-model');

      expect(custom?.modelName).toBe('unnamed-model');
    });

    it('skips providers with an empty models array', async () => {
      const config = {
        providers: {
          'empty-provider': {
            baseUrl: 'https://api.empty.com',
            api: 'openai-compatible',
            apiKey: 'key',
            models: [],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const models = await listModels();
      expect(models).toHaveLength(BUILT_IN_COUNT);
    });

    it('returns built-in models when models.json is malformed JSON', async () => {
      mockFs.readFile.mockResolvedValue('{ not valid json ~~');

      // The service catches parse errors inside readModelsJson → returns {}
      // so listModels should only return built-ins
      const models = await listModels();
      expect(models).toHaveLength(BUILT_IN_COUNT);
    });
  });

  describe('resolveCustomModelConfig', () => {
    it('returns null when models.json is absent', async () => {
      const result = await resolveCustomModelConfig('any-provider', 'any-model');
      expect(result).toBeNull();
    });

    it('returns null when the provider does not exist', async () => {
      const config = { providers: {} };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const result = await resolveCustomModelConfig('nonexistent', 'model');
      expect(result).toBeNull();
    });

    it('returns null when the model is not listed in the provider', async () => {
      const config = {
        providers: {
          'test-provider': {
            baseUrl: 'https://api.test.com',
            api: 'openai-compatible',
            apiKey: 'key',
            models: [{ id: 'other-model' }],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const result = await resolveCustomModelConfig('test-provider', 'nonexistent-model');
      expect(result).toBeNull();
    });

    it('returns full config (including apiKey) for a known custom model', async () => {
      const config = {
        providers: {
          'my-provider': {
            baseUrl: 'https://api.my.com',
            api: 'openai-compatible',
            apiKey: 'sk-secret',
            models: [{ id: 'my-model' }],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const result = await resolveCustomModelConfig('my-provider', 'my-model');
      expect(result).toEqual({
        baseUrl: 'https://api.my.com',
        api: 'openai-compatible',
        apiKey: 'sk-secret',
      });
    });

    it('returns null when the provider is missing required fields (baseUrl/apiKey/api)', async () => {
      const config = {
        providers: {
          'incomplete-provider': {
            // baseUrl and apiKey intentionally missing
            models: [{ id: 'my-model' }],
          },
        },
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const result = await resolveCustomModelConfig('incomplete-provider', 'my-model');
      expect(result).toBeNull();
    });
  });
});
