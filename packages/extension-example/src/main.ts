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
} from "./common/example-ipc";
import { EXAMPLE_EXTENSION } from "./common/example-meta";

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

    ctx.tools.register({
      name: "example/ask-user-question",
      label: "Example Ask User Question",
      description:
        "Demonstrate how an extension pauses tool execution to collect structured user feedback.",
      parameters: Type.Object({}),
      async execute() {
        const result = await ctx.extensionRuntime.askUserQuestion({
          questions: [
            {
              header: "Format",
              question: "How should the extension present the result?",
              options: [
                {
                  label: "Concise summary",
                  description: "Return only the decision and key implementation notes.",
                },
                {
                  label: "Detailed report",
                  description: "Include reasoning, tradeoffs, and implementation examples.",
                },
              ],
            },
            {
              header: "Sections",
              question: "Which sections should the extension include?",
              multiSelect: true,
              options: [
                {
                  label: "Architecture",
                  description: "Explain component ownership and data flow.",
                },
                {
                  label: "Test plan",
                  description: "List the important automated and manual scenarios.",
                },
                {
                  label: "Migration",
                  description: "Describe compatibility and rollout considerations.",
                },
              ],
            },
          ],
        });

        return {
          content: [
            {
              type: "text",
              text: `The user submitted the following extension preferences:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
          details: { humanInTheLoopResult: result },
        };
      },
    });
  },
});
