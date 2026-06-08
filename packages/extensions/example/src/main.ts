import { formatAssistantBlockFence } from "@divisor-agent/extension-core/common";
import { defineMainExtension } from "@divisor-agent/extension-core/main";
import { Type } from "@sinclair/typebox";

export default defineMainExtension((ctx) => {
  ctx.systemPrompt.register({
    id: "example.prompt",
    content: `When useful, emit assistant UI as a fenced divisor-block code block of type example.card. Do not emit bare JSON.

Example:
${formatAssistantBlockFence({ props: { title: "Hello" }, type: "example.card" })}`,
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
