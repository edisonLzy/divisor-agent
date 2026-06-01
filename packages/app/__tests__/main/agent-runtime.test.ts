import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────────────────

// Mock pi-ai for built-in models (needs to be before AgentRuntime import)
vi.mock("@mariozechner/pi-ai", () => {
  const Type = {
    Object: vi.fn((props) => props),
    String: vi.fn((opts) => ({ type: "string", ...opts })),
    Optional: vi.fn((schema) => schema),
  };
  return {
    Type,
    getProviders: vi.fn(() => ["anthropic"]),
    getModels: vi.fn(() => [
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
    ]),
  };
});

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

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

vi.mock("@mariozechner/pi-agent-core", () => ({
  Agent: MockAgent,
}));

// ── Import after mock registration ───────────────────────────────────────────

import { AgentRuntime } from "../../src/main/agent-runtime.js";
import { SkillService } from "../../src/main/skills/index.js";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("AgentRuntime", () => {
  function createRuntime() {
    return new AgentRuntime(undefined, new SkillService());
  }

  function emitAgentEvent(event: unknown) {
    const listener = mockSubscribeFn.mock.calls.at(-1)?.[0];
    expect(listener).toBeDefined();
    listener(event, new AbortController().signal);
    return Promise.resolve();
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
    it("returns mapped models from registry", async () => {
      const runtime = createRuntime();
      const models = await runtime.getAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toMatchObject({
        modelId: expect.any(String),
        providerId: expect.any(String),
        modelName: expect.any(String),
      });
    });

    it("maps model correctly with modelId and providerId", async () => {
      const runtime = createRuntime();
      const models = await runtime.getAvailableModels();

      const anthropicModels = models.filter((m) => m.providerId === "anthropic");
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels[0].modelName).toContain("anthropic");
    });
  });

  describe("setModel", () => {
    it("returns true when model is found and set", async () => {
      const runtime = createRuntime();
      const result = await runtime.setModel({
        modelId: "claude-sonnet-4-20250514",
        providerId: "anthropic",
      });

      expect(result).toBe(true);
    });

    it("returns false when model is not found", async () => {
      const runtime = createRuntime();
      const result = await runtime.setModel({
        modelId: "nonexistent-model",
        providerId: "nonexistent-provider",
      });

      expect(result).toBe(false);
    });

    it("updates agent state with model info", async () => {
      const runtime = createRuntime();
      await runtime.setModel({
        modelId: "claude-sonnet-4-20250514",
        providerId: "anthropic",
      });

      expect(mockAgentInstance.state.model).toBeDefined();
    });
  });

  describe("prompt", () => {
    it("calls agent.prompt with content", async () => {
      const runtime = createRuntime();

      await runtime.prompt({
        sessionId: "session-123",
        content: "Hello, agent!",
        model: undefined,
      });

      expect(mockPromptFn).toHaveBeenCalledWith("Hello, agent!");
    });

    it("sets model before prompting if model is provided", async () => {
      const runtime = createRuntime();

      await runtime.prompt({
        sessionId: "session-456",
        content: "Hello!",
        model: { modelId: "claude-sonnet-4-20250514", providerId: "anthropic" },
      });

      expect(mockPromptFn).toHaveBeenCalled();
    });

    it("handles agent.prompt throwing without rethrowing", async () => {
      const runtime = createRuntime();
      mockPromptFn.mockRejectedValue(new Error("Network error"));

      // Should not throw
      await expect(
        runtime.prompt({
          sessionId: "session-throw",
          content: "Hello!",
          model: undefined,
        }),
      ).resolves.not.toThrow();
    });

    it("emits renderer-ready thinking and response messages", async () => {
      const runtime = createRuntime();
      const chunkListener = vi.fn();
      runtime.on("agentMessageChunk", chunkListener);

      await runtime.setSessionId("session-stream");

      await emitAgentEvent({
        type: "message_start",
        message: { role: "assistant" },
      });

      await emitAgentEvent({
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "thinking_delta",
          contentIndex: 0,
          delta: "reasoning",
          partial: {
            content: [{ type: "thinking", thinking: "reasoning" }],
          },
        },
      });

      await emitAgentEvent({
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_end",
          contentIndex: 0,
          content: "final answer",
          partial: {
            content: [{ type: "text", text: "final answer" }],
          },
        },
      });

      expect(chunkListener).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "agentMessageChunk",
          data: expect.objectContaining({
            sessionId: "session-stream",
            message: expect.objectContaining({ kind: "thinking", content: "reasoning" }),
          }),
        }),
      );
      expect(chunkListener).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "agentMessageChunk",
          data: expect.objectContaining({
            sessionId: "session-stream",
            message: expect.objectContaining({ kind: "response", content: "final answer" }),
          }),
        }),
      );
    });

    it("emits renderer-ready tool messages", async () => {
      const runtime = createRuntime();
      const chunkListener = vi.fn();
      runtime.on("agentMessageChunk", chunkListener);

      await runtime.setSessionId("session-tool");

      await emitAgentEvent({
        type: "tool_execution_start",
        toolCallId: "tool-1",
        toolName: "fs/read_text_file",
        args: { path: "/tmp/demo.txt" },
      });

      await emitAgentEvent({
        type: "tool_execution_end",
        toolCallId: "tool-1",
        toolName: "fs/read_text_file",
        result: {
          content: [{ type: "text", text: "hello" }],
          details: { toolCallId: "tool-1" },
        },
        isError: false,
      });

      expect(chunkListener).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "agentMessageChunk",
          data: expect.objectContaining({
            sessionId: "session-tool",
            message: expect.objectContaining({
              kind: "tool",
              toolName: "fs/read_text_file",
              output: "hello",
              state: "done",
            }),
          }),
        }),
      );
    });
  });

  describe("destroy", () => {
    it("clears all listeners without throwing", () => {
      const runtime = createRuntime();

      // Add listeners
      runtime.on("agentMessageChunk", vi.fn());
      runtime.on("agentMessageDone", vi.fn());

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
