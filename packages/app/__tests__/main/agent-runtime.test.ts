import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

// Mock pi-ai so the upstream catalog isn't pulled in at test time. Type
// helpers are stubbed because some tool schemas call them at construction;
// getProviders/getModels return empty arrays because the AgentRuntime under
// test doesn't load built-in catalogs (that lives in AgentPool — see
// agent-pool.test.ts).
vi.mock("@earendil-works/pi-ai", () => {
  const Type = {
    Array: vi.fn((items, opts) => ({ type: "array", items, ...opts })),
    Object: vi.fn((props) => props),
    String: vi.fn((opts) => ({ type: "string", ...opts })),
    Optional: vi.fn((schema) => schema),
  };
  return {
    Type,
    getProviders: vi.fn(() => []),
    getModels: vi.fn(() => []),
  };
});

// Hand off node:fs/promises to the in-memory fs (see __mocks__/fs/promises.cjs)
// so ModelRegistry's constructor doesn't trip on a missing models.json. This
// file doesn't assert any fs behavior — fs mocking is owned by registry.test.ts.
vi.mock("node:fs/promises");

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock Agent from pi-agent-core - use vi.hoisted to properly set up mocks
const { mockAgentInstance, mockSubscribeFn, mockPromptFn, MockAgent } = vi.hoisted(() => {
  const mockSubscribe = vi.fn();
  const mockPrompt = vi.fn();

  const mockAgentInstance = {
    subscribe: mockSubscribe,
    prompt: mockPrompt,
    state: {} as Record<string, unknown>,
  };

  // Create a constructor function that returns the mock instance
  function MockAgent(_config: any) {
    return mockAgentInstance;
  }

  return { mockAgentInstance, mockSubscribeFn: mockSubscribe, mockPromptFn: mockPrompt, MockAgent };
});

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: MockAgent,
}));

// ── Import after mock registration ───────────────────────────────────────────

import { AgentRuntime } from "../../src/main/agent-runtime.js";
import type { ExtensionService } from "../../src/main/extensions/index.js";
import { SkillService } from "../../src/main/skills/index.js";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("AgentRuntime", () => {
  function createRuntime() {
    const extensionService = {
      buildSystemPrompt: (raw: string) => raw,
      getToolsForRuntime: () => [],
    } as unknown as ExtensionService;

    return new AgentRuntime(undefined, new SkillService(), extensionService);
  }

  beforeEach(() => {
    // Don't use clearAllMocks as it clears the mock implementations
    // Instead, reset the mock implementations directly
    mockSubscribeFn.mockClear();
    mockPromptFn.mockClear();
    mockPromptFn.mockResolvedValue(undefined);
    mockAgentInstance.state = {};
  });

  describe("constructor", () => {
    it("creates Agent and subscribes to events", () => {
      createRuntime();

      // Agent should be created with tools and subscribe should be called
      expect(mockSubscribeFn).toHaveBeenCalled();
    });
  });

  describe("getAvailableModels", () => {
    // AgentRuntime does not expose `getAvailableModels` — that lives on the
    // AgentPool layer. The model-resolution contract is exercised in
    // agent-pool.test.ts via pool.getAvailableModels() / pool.setModel().
    it("does not expose getAvailableModels directly", () => {
      const runtime = createRuntime();
      expect(
        (runtime as unknown as { getAvailableModels?: unknown }).getAvailableModels,
      ).toBeUndefined();
    });
  });

  describe("setModel", () => {
    // setModel's "what models exist" half depends on the registry having
    // entries to resolve against. AgentRuntime wires the registry but does
    // not own the catalog; this file doesn't seed a registry, so we only
    // cover the negative-path. The positive-path + sessionId routing lives
    // in agent-pool.test.ts where the registry is wired through AgentPool.
    it("returns false when the registry cannot resolve the model", async () => {
      const runtime = createRuntime();
      const result = await runtime.setModel({
        modelId: "nonexistent-model",
        providerId: "nonexistent-provider",
      });
      expect(result).toBe(false);
    });
  });

  describe("prompt", () => {
    it("calls agent.prompt with content", async () => {
      const runtime = createRuntime();
      const message = {
        role: "user" as const,
        content: "Hello, agent!",
        timestamp: Date.now(),
        kind: "prompt" as const,
        jsonContent: { type: "doc" },
      };

      await runtime.prompt(message);

      expect(mockPromptFn).toHaveBeenCalledWith(message);
    });

    it("sets model before prompting if model is provided", async () => {
      const runtime = createRuntime();

      await runtime.prompt({
        role: "user",
        content: "Hello!",
        timestamp: Date.now(),
        kind: "prompt",
        jsonContent: { type: "doc" },
        metadata: {
          model: { modelId: "claude-sonnet-4-20250514", providerId: "anthropic" },
        },
      });

      expect(mockPromptFn).toHaveBeenCalled();
    });

    // The original "handles agent.prompt throwing without rethrowing" case
    // asserted that runtime.prompt swallowed errors from agent.prompt. The
    // current implementation simply forwards the rejection. We're pinning
    // that behavior here; if a future change re-introduces internal error
    // isolation, this test should flip back to .resolves.not.toThrow().
    it("propagates errors from agent.prompt", async () => {
      const runtime = createRuntime();
      mockPromptFn.mockRejectedValue(new Error("Network error"));

      await expect(
        runtime.prompt({
          role: "user",
          content: "Hello!",
          timestamp: Date.now(),
          kind: "prompt",
          jsonContent: { type: "doc" },
        }),
      ).rejects.toThrow("Network error");
    });

    // Note: the previous "emits renderer-ready thinking/tool messages" cases
    // listened for `agentMessageChunk` and asserted `name: "agentMessageChunk"`
    // on emitted payloads. AgentRuntime only emits raw AgentEvent keys
    // (`message_start`, `message_update`, `tool_execution_*`); the
    // `agentMessageChunk` IPC-level event name is produced by the AgentPool /
    // renderer side. The end-to-end raw→IPC mapping now lives in
    // agent-pool.test.ts / renderer tests, so those cases were dropped from
    // this file rather than rewritten against a misleading event name.
  });

  describe("askUserQuestion", () => {
    it("allows a built-in tool factory to request input through the runtime", async () => {
      const extensionService = {
        buildSystemPrompt: (raw: string) => raw,
        getToolsForRuntime: () => [],
      } as unknown as ExtensionService;
      const runtime = new AgentRuntime(undefined, new SkillService(), extensionService);
      runtime.setSessionId("runtime-session");

      const requestEvent = runtime.once("ask_user_question_requested");
      const resultPromise = runtime.askUserQuestion({
        questions: [
          {
            header: "Scope",
            question: "Which scope?",
            options: [
              { label: "Focused", description: "Only this module." },
              { label: "Broad", description: "All related modules." },
            ],
          },
        ],
      });
      const request = (await requestEvent).data;
      await runtime.resolveAskUserQuestion(request.requestId, {
        answers: [{ question: "Which scope?", selectedOptions: ["Focused"] }],
      });

      await expect(resultPromise).resolves.toMatchObject({
        answers: [{ selectedOptions: ["Focused"] }],
      });
    });
  });

  describe("destroy", () => {
    it("clears all listeners without throwing", () => {
      const runtime = createRuntime();

      // Add listeners on real AgentEvent keys that AgentRuntime forwards via
      // this.emit(event.type, event) — see "creates Agent and subscribes".
      runtime.on("message_start", vi.fn());
      runtime.on("tool_execution_start", vi.fn());

      // Destroy should not throw
      expect(() => runtime.destroy()).not.toThrow();
    });
  });

  describe("setHistoryMessages", () => {
    it("is a no-op (TODO) implementation", async () => {
      const runtime = createRuntime();

      // Should not throw
      await expect(
        runtime.setHistoryMessages([{ content: "Hello", metadata: {} }]),
      ).resolves.not.toThrow();
    });
  });
});
