import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { MockAgent, agentMockState } = vi.hoisted(() => {
  type AgentListener = (event: unknown, signal: AbortSignal) => void | Promise<void>;

  const state = {
    configs: [] as any[],
    instances: [] as any[],
    promptBehavior: "emit" as "emit" | "pending",
  };

  function MockAgent(config: any) {
    let listener: AgentListener | undefined;
    const instance = {
      subscribe: vi.fn((candidate: AgentListener) => {
        listener = candidate;
        return vi.fn();
      }),
      continue: vi.fn(async () => {
        if (state.promptBehavior === "pending") {
          return new Promise<void>(() => undefined);
        }

        await listener?.(
          {
            type: "message_update",
            message: { role: "assistant", content: [{ type: "text", text: "Hello " }] },
            assistantMessageEvent: {
              type: "text_delta",
              delta: "Hello ",
            },
          },
          new AbortController().signal,
        );
        await listener?.(
          {
            type: "message_update",
            message: { role: "assistant", content: [{ type: "text", text: "Hello world" }] },
            assistantMessageEvent: {
              type: "text_delta",
              delta: "world",
            },
          },
          new AbortController().signal,
        );
      }),
      prompt: vi.fn(),
      waitForIdle: vi.fn(async () => undefined),
      abort: vi.fn(),
    };

    state.configs.push(config);
    state.instances.push(instance);
    return instance;
  }

  return { MockAgent, agentMockState: state };
});

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: MockAgent,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(async () =>
    JSON.stringify({
      providers: {
        anthropic: {
          api: "anthropic-chat",
          apiKey: "test-key",
          baseUrl: "",
          models: [
            {
              id: "claude-sonnet-4-20250514",
              name: "Claude Sonnet 4",
            },
          ],
        },
      },
    }),
  ),
}));

import type { AgentMessage, AppUserMessage } from "@earendil-works/pi-agent-core";

import { AgentPool } from "../../src/main/agent-pool.js";

describe("AgentPool", () => {
  beforeEach(() => {
    agentMockState.configs.length = 0;
    agentMockState.instances.length = 0;
    agentMockState.promptBehavior = "emit";
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a one-time agent with the provided system prompt, model, and no tools", async () => {
    const pool = new AgentPool({} as never);
    const userMessage = createUserMessage("Name this session");

    const result = await pool.runOneTimeAgent([userMessage], {
      systemPrompt: "Only output a title.",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      },
    });

    expect(result).toBe("Hello world");
    expect(agentMockState.configs).toHaveLength(1);
    expect(agentMockState.configs[0].initialState).toMatchObject({
      systemPrompt: "Only output a title.",
      tools: [],
      messages: [userMessage],
      model: {
        id: "claude-sonnet-4-20250514",
        provider: "anthropic",
      },
    });
    expect(agentMockState.configs[0].getApiKey("anthropic")).toBe("test-key");
    expect(agentMockState.instances[0].continue).toHaveBeenCalledOnce();
    expect(agentMockState.instances[0].prompt).not.toHaveBeenCalled();
  });

  it("uses all messages as the one-time agent transcript", async () => {
    const pool = new AgentPool({} as never);
    const firstUser = createUserMessage("Earlier request");
    const assistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Earlier response" }],
      timestamp: Date.now(),
    } as AgentMessage;
    const lastUser = createUserMessage("Summarize the current context");

    await pool.runOneTimeAgent([firstUser, assistantMessage, lastUser], {
      systemPrompt: "Summarize briefly.",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      },
    });

    expect(agentMockState.configs[0].initialState.messages).toEqual([
      firstUser,
      assistantMessage,
      lastUser,
    ]);
    expect(agentMockState.instances[0].continue).toHaveBeenCalledOnce();
    expect(agentMockState.instances[0].prompt).not.toHaveBeenCalled();
  });

  it("throws when the requested model cannot be resolved", async () => {
    const pool = new AgentPool({} as never);

    await expect(
      pool.runOneTimeAgent([createUserMessage("Hello")], {
        systemPrompt: "Only output text.",
        model: {
          providerId: "anthropic",
          modelId: "missing-model",
        },
      }),
    ).rejects.toThrow("Model not found: anthropic/missing-model");
  });

  it("aborts and returns partial output on timeout", async () => {
    vi.useFakeTimers();
    agentMockState.promptBehavior = "pending";
    const pool = new AgentPool({} as never);

    const resultPromise = pool.runOneTimeAgent([createUserMessage("Hello")], {
      systemPrompt: "Only output text.",
      timeout: 10,
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      },
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toBe("");
    expect(agentMockState.instances[0].abort).toHaveBeenCalledOnce();
  });
});

function createUserMessage(content: string): AppUserMessage {
  return {
    role: "user",
    content,
    timestamp: Date.now(),
    kind: "prompt",
    jsonContent: { type: "doc" },
  };
}
