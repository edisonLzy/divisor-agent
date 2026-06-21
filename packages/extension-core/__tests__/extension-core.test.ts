import {
  formatArtifactFence,
  formatAssistantBlockFence,
  parseArtifactPayload,
  parseAssistantBlockPayload,
} from "@divisor-agent/extension-core/common";
import {
  defineMainExtension,
  MainExtensionBridge,
  type InstalledMainExtension,
} from "@divisor-agent/extension-core/main";
import {
  defineExtensionManifest,
  type ExtensionManifest,
} from "@divisor-agent/extension-core/manifest";
import {
  defineRendererExtension,
  parseExtensionParts,
  RendererExtensionBridge,
  type InstalledRendererExtension,
} from "@divisor-agent/extension-core/renderer";
import { describe, expect, it, vi } from "vitest";

describe("extension-core", () => {
  const manifest = defineExtensionManifest({
    id: "test-extension",
    name: "Test Extension",
  });

  it("initializes main extensions once and exposes registered capabilities", () => {
    const setup = vi.fn((ctx) => {
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
    });
    const extensions: InstalledMainExtension[] = [
      {
        manifest,
        extension: defineMainExtension(setup),
      },
    ];
    const bridge = new MainExtensionBridge(extensions);

    bridge.initialize();
    bridge.initialize();

    expect(setup).toHaveBeenCalledTimes(1);
    expect(bridge.listExtensions()).toEqual<ExtensionManifest[]>([manifest]);
    expect(bridge.getSystemPrompts()).toEqual(["Use test extension behavior."]);
    expect(bridge.getTools()).toHaveLength(1);
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
    const extensions: InstalledRendererExtension[] = [
      {
        manifest,
        extension: defineRendererExtension(setup),
      },
    ];
    const bridge = new RendererExtensionBridge(extensions);

    bridge.initialize();
    bridge.initialize();

    const registry = bridge.getRegistry();
    expect(setup).toHaveBeenCalledTimes(1);
    expect(registry.listExtensions()).toEqual([manifest]);
    expect(registry.getSlashCommands()).toHaveLength(1);
    expect(registry.getAssistantBlock("test.block")).toBeDefined();
    expect(registry.getArtifact("test.artifact")).toBeDefined();
    expect(registry.getStreamdownRehypePlugins([])).toEqual([testRehypePlugin]);
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
