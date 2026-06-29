import {
  EXTENSION_EVENT_CHANNEL,
  formatArtifactFence,
  formatAssistantBlockFence,
  parseArtifactPayload,
  parseAssistantBlockPayload,
} from "@divisor-agent/extension-core/common";
import { defineMainExtension, MainExtensionBridge } from "@divisor-agent/extension-core/main";
import type {
  MainExtensionContextValues,
  MainExtensionRuntimeAPI,
} from "@divisor-agent/extension-core/main";
import {
  createUseExtensionIPC,
  defineRendererExtension,
  parseExtensionParts,
  RendererExtensionBridge,
} from "@divisor-agent/extension-core/renderer";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

describe("extension-core", () => {
  const metadata = {
    id: "test-extension",
    name: "Test Extension",
  } as const;

  it("initializes main extensions once and exposes registered capabilities", async () => {
    interface InvokeEvents {
      getState(prefix: string): string;
    }
    interface OnEvents {
      stateChanged(value: string): void;
    }

    const send = vi.fn();
    const getBrowserWindow = vi.fn(
      () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            send,
          },
        }) as unknown as BrowserWindow,
    );
    const sessionDestroyed = vi.fn();
    const setup = vi.fn((ctx) => {
      ctx.getBrowserWindow();
      ctx.systemPrompt.register({
        id: "test.prompt",
        content: "Use test extension behavior.",
      });
      ctx.tools.register({
        name: "test/tool",
        description: "Test tool",
        parameters: {},
        async execute() {
          return {
            content: [{ type: "text", text: "ok" }],
            details: {},
          };
        },
      } as never);
      ctx.ipc.handle("getState", (prefix) => `${prefix}:ready`);
      ctx.ipc.emit("stateChanged", "ready");
      return ctx.agent.on("session_destroyed", sessionDestroyed);
    });
    const extension = defineMainExtension<InvokeEvents, OnEvents>({
      ...metadata,
      setup,
    });
    const bridge = new MainExtensionBridge([extension], {
      extensionRuntime: createAgentRuntime(),
      getBrowserWindow,
    });

    bridge.initialize();
    bridge.initialize();

    expect(setup).toHaveBeenCalledTimes(1);
    expect(getBrowserWindow).toHaveBeenCalledTimes(2);
    expect(bridge.listExtensions()).toEqual([metadata]);
    expect(bridge.getSystemPrompts()).toEqual(["Use test extension behavior."]);
    expect(bridge.getTools()).toHaveLength(1);
    await expect(bridge.invokeIPC(metadata.id, "getState", ["test"])).resolves.toBe("test:ready");
    expect(send).toHaveBeenCalledWith(EXTENSION_EVENT_CHANNEL, {
      args: ["ready"],
      event: "stateChanged",
      extensionId: metadata.id,
    });

    await bridge.emitSessionDestroyed("session-1");
    expect(sessionDestroyed).toHaveBeenCalledWith({ sessionId: "session-1" });

    bridge.dispose();
    await bridge.emitSessionDestroyed("session-2");
    expect(sessionDestroyed).toHaveBeenCalledTimes(1);
  });

  it("initializes renderer extensions once and exposes UI registrations", () => {
    function TestRenderer() {
      return null;
    }

    function testRehypePlugin() {}

    const setup = vi.fn((ctx) => {
      ctx.slashCommands.register({
        id: "test.command",
        group: "Test",
        name: "Test command",
        description: "Run the test command",
        run() {},
      });
      ctx.assistantBlocks.register({
        type: "test.block",
        render: TestRenderer,
      });
      ctx.artifacts.register({
        type: "test.artifact",
        render: TestRenderer,
      });
      ctx.streamdown.registerRehypePlugins((plugins) => [...plugins, testRehypePlugin]);
    });
    const extension = defineRendererExtension({ ...metadata, setup });
    const bridge = new RendererExtensionBridge([extension]);

    bridge.initialize();
    bridge.initialize();

    const registry = bridge.getRegistry();
    expect(setup).toHaveBeenCalledTimes(1);
    expect(registry.listExtensions()).toEqual([metadata]);
    expect(registry.getSlashCommands()).toHaveLength(1);
    expect(registry.getAssistantBlock("test.block")).toBeDefined();
    expect(registry.getArtifact("test.artifact")).toBeDefined();
    expect(registry.getStreamdownRehypePlugins([])).toEqual([testRehypePlugin]);
  });

  it("binds renderer IPC clients to an extension id", async () => {
    interface InvokeEvents {
      getState(prefix: string): string;
    }
    interface OnEvents {
      stateChanged(value: string): void;
    }

    const invoke = vi.fn(async () => "test:ready");
    const unsubscribe = vi.fn();
    const on = vi.fn(() => unsubscribe);
    vi.stubGlobal("window", { extensionsAPI: { invoke, on } });

    const useExtensionIPC = createUseExtensionIPC<InvokeEvents, OnEvents>(metadata.id);
    const ipc = useExtensionIPC();
    const listener = vi.fn();

    await expect(ipc.invoke("getState", "test")).resolves.toBe("test:ready");
    expect(invoke).toHaveBeenCalledWith(metadata.id, "getState", ["test"]);
    expect(ipc.on("stateChanged", listener)).toBe(unsubscribe);
    expect(on).toHaveBeenCalledWith(metadata.id, "stateChanged", listener);

    vi.unstubAllGlobals();
  });

  it("rejects duplicate extension ids and IPC handlers", () => {
    const duplicateHandler = defineMainExtension<{ ping(): void }>({
      ...metadata,
      setup(ctx) {
        ctx.ipc.handle("ping", () => undefined);
        ctx.ipc.handle("ping", () => undefined);
      },
    });
    expect(() =>
      new MainExtensionBridge([duplicateHandler], createContextValues()).initialize(),
    ).toThrow("Duplicate extension IPC handler");

    const first = defineRendererExtension({ ...metadata, setup() {} });
    const second = defineRendererExtension({ ...metadata, setup() {} });
    expect(() => new RendererExtensionBridge([first, second]).initialize()).toThrow(
      "Duplicate extension id",
    );
  });

  it("parses extension blocks and artifacts while preserving markdown text", () => {
    const parts = parseExtensionParts(`before
\`\`\`divisor-block
{"type":"test.block","props":{"title":"Block"}}
\`\`\`
middle
\`\`\`divisor-artifact
{"id":"artifact-1","type":"test.artifact","props":{"title":"Artifact"}}
\`\`\`
after`);

    expect(parts).toEqual([
      { kind: "text", text: "before\n" },
      {
        kind: "block",
        payload: {
          id: undefined,
          type: "test.block",
          props: { title: "Block" },
          raw: '{"type":"test.block","props":{"title":"Block"}}',
        },
      },
      { kind: "text", text: "\nmiddle\n" },
      {
        kind: "artifact",
        payload: {
          id: "artifact-1",
          type: "test.artifact",
          props: { title: "Artifact" },
          raw: '{"id":"artifact-1","type":"test.artifact","props":{"title":"Artifact"}}',
        },
      },
      { kind: "text", text: "\nafter" },
    ]);
  });

  it("keeps invalid extension fences as text", () => {
    const content = '```divisor-block\n{"props":{}}\n```';

    expect(parseExtensionParts(content)).toEqual([{ kind: "text", text: content }]);
  });

  it("formats assistant block fences", () => {
    expect(
      formatAssistantBlockFence({
        props: { title: "Hello" },
        type: "example.card",
      }),
    ).toBe('```divisor-block\n{"type":"example.card","props":{"title":"Hello"}}\n```');
  });

  it("parses assistant block payloads", () => {
    expect(
      parseAssistantBlockPayload('{"type":"example.card","props":{"title":"Hello"}}', false),
    ).toEqual({
      payload: {
        props: { title: "Hello" },
        raw: '{"type":"example.card","props":{"title":"Hello"}}',
        type: "example.card",
      },
      status: "ready",
    });
  });

  it("tracks incomplete assistant block payloads while streaming", () => {
    expect(parseAssistantBlockPayload('{"type":"example.card","props":{', true)).toEqual({
      raw: '{"type":"example.card","props":{',
      status: "pending",
    });

    expect(parseAssistantBlockPayload('{"type":"example.card","props":{', false)).toEqual({
      raw: '{"type":"example.card","props":{',
      status: "invalid",
    });
  });

  it("formats artifact fences", () => {
    expect(
      formatArtifactFence({
        id: "artifact-1",
        props: { title: "Hello" },
        type: "example.artifact",
      }),
    ).toBe(
      '```divisor-artifact\n{"id":"artifact-1","type":"example.artifact","props":{"title":"Hello"}}\n```',
    );
  });

  it("parses artifact payloads", () => {
    expect(
      parseArtifactPayload(
        '{"id":"artifact-1","type":"example.artifact","props":{"title":"Hello"}}',
        false,
      ),
    ).toEqual({
      payload: {
        id: "artifact-1",
        props: { title: "Hello" },
        raw: '{"id":"artifact-1","type":"example.artifact","props":{"title":"Hello"}}',
        type: "example.artifact",
      },
      status: "ready",
    });
  });

  it("tracks incomplete artifact payloads while streaming", () => {
    expect(parseArtifactPayload('{"type":"example.artifact","props":{', true)).toEqual({
      raw: '{"type":"example.artifact","props":{',
      status: "pending",
    });

    expect(parseArtifactPayload('{"type":"example.artifact","props":{', false)).toEqual({
      raw: '{"type":"example.artifact","props":{',
      status: "invalid",
    });
  });
});

function createContextValues(): MainExtensionContextValues {
  return {
    extensionRuntime: createAgentRuntime(),
    getBrowserWindow: () => null,
  };
}

function createAgentRuntime(): MainExtensionRuntimeAPI {
  return {
    abortAgent: vi.fn(),
    createAgent: vi.fn(),
    destroyAgent: vi.fn(),
    getCurrentAgentContext: vi.fn(),
    promptAgent: vi.fn(),
    subscribeAgentEvents: vi.fn(() => vi.fn()),
  };
}
