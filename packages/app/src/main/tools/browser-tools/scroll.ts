import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const ScrollParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  dy: Type.Number({
    description: "Pixels to scroll (positive = down, negative = up).",
  }),
  ref: Type.Optional(
    Type.String({
      description: "Optional ref to scroll into view (else scrolls the window).",
    }),
  ),
});

export const browserScrollTool: AppTool<typeof ScrollParams> = {
  name: "browser/scroll",
  label: "Scroll Page",
  description:
    "Scroll the active browser tab (or bring `ref` into view) by `dy` pixels (positive = down).",
  riskLevel: "safe",
  parameters: ScrollParams,
  async execute(toolCallId, params) {
    const { artifactId, dy, ref } = params as {
      artifactId?: string;
      dy: number;
      ref?: string;
    };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const { observation, state } = await manager.dispatch(resolved.sessionId, resolved.artifactId, {
      dy,
      kind: "scroll",
      ref,
    });
    return {
      content: [{ text: `Scrolled ${dy}px on ${observation.url}`, type: "text" }],
      details: {
        action: "scroll",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "scroll",
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        dy,
        observation,
        ref,
        state,
        toolCallId,
      },
    };
  },
};