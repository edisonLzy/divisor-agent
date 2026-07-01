import {
  formatArtifactFence,
  formatAssistantBlockFence,
} from "@divisor-agent/extension-core/common";
import { defineMainExtension } from "@divisor-agent/extension-core/main";
import { Type } from "@earendil-works/pi-ai";

import {
  type AllowedRenderInvokeEvents,
  type AllowedMainExposeEvents,
  type ExampleState,
} from "./share/example-ipc";
import { EXAMPLE_EXTENSION } from "./share/example-meta";

export default defineMainExtension<AllowedRenderInvokeEvents, AllowedMainExposeEvents>({
  ...EXAMPLE_EXTENSION,
  setup(ctx) {
    const state: ExampleState = { greetingCount: 0 };
    ctx.ipc.handle("getState", () => ({ ...state }));

    ctx.ipc.handle("incrementGreeting", () => {
      state.greetingCount += 1;
      ctx.ipc.emit("stateChanged", { ...state });
    });

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
        state.greetingCount += 1;
        ctx.ipc.emit("stateChanged", { ...state });
        return {
          content: [{ type: "text", text: `Hello, ${String(args.name)}` }],
          details: {},
        };
      },
    });
  },
});
