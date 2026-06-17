import {
  formatArtifactFence,
  formatAssistantBlockFence,
} from "@divisor-agent/extension-core/common";
import { defineMainExtension } from "@divisor-agent/extension-core/main";
import { Type } from "@sinclair/typebox";

export default defineMainExtension((ctx) => {
  ctx.systemPrompt.register({
    id: "example.prompt",
    content: `When useful, emit assistant UI as fenced divisor-block or divisor-artifact code blocks. Use divisor-block for inline cards and divisor-artifact for right-panel previews. Do not emit bare JSON.

Inline example:
${formatAssistantBlockFence({ props: { title: "Hello" }, type: "example.card" })}

Artifact example:
${formatArtifactFence({
  id: "example-artifact",
  props: { title: "Hello artifact" },
  type: "example.artifact",
})}`,
  });

  ctx.tools.register({
    name: "example/hello",
    label: "Example Hello",
    description: "Say hello from the example extension",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(_toolCallId, args) {
      return {
        content: [{ type: "text", text: `Hello, ${String(args.name)}` }],
        details: {},
      };
    },
  });
});
