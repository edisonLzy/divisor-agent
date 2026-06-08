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
});
