import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const ClickParams = Type.Object({
  artifactId: Type.Optional(
    Type.String({ description: "Stable browser artifact id; defaults to most recent." }),
  ),
  ref: Type.String({
    description: "Element ref from the latest browser/observe output (e.g. 'e5').",
  }),
});

export const browserClickTool: AppTool<typeof ClickParams> = {
  name: "browser/click",
  label: "Click Element",
  description:
    "Click the element identified by `ref` (from a recent browser/observe call). Refs expire on navigation; re-run browser/observe if you get a RefExpiredError.",
  riskLevel: "high",
  parameters: ClickParams,
  async execute(toolCallId, params) {
    const { artifactId, ref } = params as { artifactId?: string; ref: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const { observation, state } = await manager.dispatch(resolved.sessionId, resolved.artifactId, {
      kind: "click",
      ref,
    });
    return {
      content: [{ text: `Clicked ${ref} on ${observation.url}`, type: "text" }],
      details: {
        action: "click",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "click",
            ref,
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        observation,
        ref,
        state,
        toolCallId,
      },
    };
  },
};