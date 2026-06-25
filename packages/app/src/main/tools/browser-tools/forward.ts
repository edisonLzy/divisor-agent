import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const NavParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
});

export const browserForwardTool: AppTool<typeof NavParams> = {
  name: "browser/forward",
  label: "Navigate Forward",
  description: "Navigate forward in the active browser tab's history.",
  riskLevel: "medium",
  parameters: NavParams,
  async execute(toolCallId, params) {
    const { artifactId } = params as { artifactId?: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const { observation, state } = await manager.dispatch(resolved.sessionId, resolved.artifactId, {
      kind: "forward",
    });
    return {
      content: [{ text: `Navigated forward to ${observation.url}`, type: "text" }],
      details: {
        action: "forward",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "forward",
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        observation,
        state,
        toolCallId,
      },
    };
  },
};