import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-ai", () => {
  const Type = {
    Array: vi.fn((items, options) => ({ type: "array", items, ...options })),
    Boolean: vi.fn((options) => ({ type: "boolean", ...options })),
    Literal: vi.fn((value) => ({ const: value })),
    Object: vi.fn((properties) => properties),
    Optional: vi.fn((schema) => schema),
    String: vi.fn((options) => ({ type: "string", ...options })),
    Union: vi.fn((schemas) => ({ anyOf: schemas })),
  };
  return { Type };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () =>
    JSON.stringify({
      providers: {
        anthropic: {
          api: "anthropic-chat",
          apiKey: "test-key",
          baseUrl: "",
          models: [{ id: "claude-sonnet", name: "Claude Sonnet" }],
        },
      },
    }),
  ),
  writeFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const { MockAgent, agentState } = vi.hoisted(() => {
  const state = {
    config: undefined as any,
    listener: undefined as ((event: any) => void) | undefined,
    instance: {
      abort: vi.fn(),
      clearAllQueues: vi.fn(),
      continue: vi.fn(),
      hasQueuedMessages: vi.fn(() => false),
      prompt: vi.fn(),
      state: {} as Record<string, any>,
      subscribe: vi.fn(),
      waitForIdle: vi.fn(),
    },
  };

  function MockAgent(config: any) {
    state.config = config;
    state.instance.subscribe.mockImplementation((listener: (event: any) => void) => {
      state.listener = listener;
      return vi.fn();
    });
    return state.instance;
  }

  return { MockAgent, agentState: state };
});

vi.mock("@earendil-works/pi-agent-core", () => ({ Agent: MockAgent }));

import { AgentRuntime } from "../../src/main/agent-runtime.js";
import { SkillService } from "../../src/main/skills/index.js";

describe("AgentRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentState.config = undefined;
    agentState.listener = undefined;
    agentState.instance.state = {};
  });

  it("registers the ask_user built-in tool", () => {
    createRuntime();

    expect(agentState.config.initialState.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "ask_user" })]),
    );
  });

  it("loads and sets a configured model", async () => {
    const runtime = createRuntime();

    await expect(
      runtime.setModel({ providerId: "anthropic", modelId: "claude-sonnet" }),
    ).resolves.toBe(true);
    expect(agentState.instance.state.model).toMatchObject({ id: "claude-sonnet" });
  });

  it("routes prompt, steering, and follow-up messages", async () => {
    const runtime = createRuntime();

    await runtime.prompt(createMessage("prompt"));
    await runtime.prompt(createMessage("steering"));
    await runtime.prompt(createMessage("follow-up"));

    expect(agentState.instance.prompt).toHaveBeenCalledOnce();
    expect(agentState.instance.steer).toHaveBeenCalledOnce();
    expect(agentState.instance.followUp).toHaveBeenCalledOnce();
  });

  it("re-emits raw agent events", async () => {
    const runtime = createRuntime();
    const listener = vi.fn();
    runtime.on("message_start", listener);

    const event = { type: "message_start", message: { role: "assistant", content: [] } };
    agentState.listener?.(event);
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith({ name: "message_start", data: event });
  });

  it("emits and resolves ask_user interactions", async () => {
    const runtime = createRuntime();
    const handleRequest = vi.fn();
    runtime.on("user_interaction_requested", handleRequest);
    const askUserTool = agentState.config.initialState.tools.find(
      (tool: { name: string }) => tool.name === "ask_user",
    );

    const resultPromise = askUserTool.execute("tool-call", {
      questions: [{ id: "details", question: "Anything else?", type: "text" }],
    });
    await Promise.resolve();
    const request = handleRequest.mock.calls[0][0].data;
    await runtime.resolveUserInteraction(request.requestId, {
      status: "submitted",
      answers: [{ questionId: "details", text: "No" }],
    });

    await expect(resultPromise).resolves.toMatchObject({
      details: { status: "submitted" },
    });
  });

  it("cancels pending user interactions when aborted", async () => {
    const runtime = createRuntime();
    const handleRequest = vi.fn();
    runtime.on("user_interaction_requested", handleRequest);
    const askUserTool = agentState.config.initialState.tools.find(
      (tool: { name: string }) => tool.name === "ask_user",
    );
    const resultPromise = askUserTool.execute("tool-call", {
      questions: [{ id: "details", question: "Anything else?", type: "text" }],
    });

    await runtime.abortPrompt();

    await expect(resultPromise).resolves.toMatchObject({
      details: { status: "cancelled", reason: "Agent prompt aborted" },
    });
    expect(agentState.instance.abort).toHaveBeenCalledOnce();
  });

  it("rejects stale user interaction responses", async () => {
    const runtime = createRuntime();

    await expect(
      runtime.resolveUserInteraction("missing-request", { status: "dismissed" }),
    ).rejects.toThrow("User interaction not found or already resolved");
  });

  it("stores history messages and clears pending work on destroy", async () => {
    const runtime = createRuntime();
    const messages = [{ role: "user", content: "Hello", timestamp: 1 }] as any;

    await runtime.setHistoryMessages(messages);
    runtime.destroy();

    expect(agentState.instance.state.messages).toBe(messages);
  });
});

function createRuntime() {
  agentState.instance.steer = vi.fn();
  agentState.instance.followUp = vi.fn();
  return new AgentRuntime(undefined, new SkillService());
}

function createMessage(kind: "prompt" | "steering" | "follow-up") {
  return {
    role: "user" as const,
    content: "Hello",
    timestamp: Date.now(),
    kind,
    jsonContent: { type: "doc" },
  };
}
