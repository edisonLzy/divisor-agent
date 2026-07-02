import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const TypeParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  ref: Type.String({
    description: "Element ref from the latest browser/observe output.",
  }),
  submit: Type.Optional(
    Type.Boolean({
      description: "If true, press Enter after typing.",
    }),
  ),
  text: Type.String({ description: "Text to type into the focused element." }),
});

export const browserTypeTool: AppTool<typeof TypeParams> = {
  name: "browser/type",
  label: "Type Into Element",
  description:
    "Focus the element identified by `ref` and type `text`. Pass submit=true to press Enter afterwards (useful for search boxes).",
  riskLevel: "high",
  parameters: TypeParams,
  async execute(toolCallId, params) {
    const { artifactId, ref, submit, text } = params as {
      artifactId?: string;
      ref: string;
      submit?: boolean;
      text: string;
    };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const { observation, state } = await manager.dispatch(resolved.sessionId, resolved.artifactId, {
      kind: "type",
      ref,
      submit,
      text,
    });
    return {
      content: [
        {
          text: `Typed ${JSON.stringify(text)} into ${ref} on ${observation.url}`,
          type: "text",
        },
      ],
      details: {
        action: "type",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "type",
            ref,
            screenshotDataUrl: observation.screenshotDataUrl,
            text,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        observation,
        ref,
        state,
        text,
        toolCallId,
      },
    };
  },
};