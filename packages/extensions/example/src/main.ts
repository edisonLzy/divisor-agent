import { defineMainExtension } from "@divisor-agent/extension-core/main";
import { Type } from "@sinclair/typebox";

export default defineMainExtension((ctx) => {
  ctx.systemPrompt.register({
    id: "example.prompt",
    content: "When useful, emit divisor-block JSON blocks of type example.card.",
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
