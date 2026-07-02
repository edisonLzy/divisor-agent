import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const GotoParams = Type.Object({
  artifactId: Type.Optional(
    Type.String({
      description:
        "Stable browser artifact id (from a prior browser/open call). Defaults to the most recent browser artifact.",
    }),
  ),
  url: Type.String({ description: "The URL to navigate to (https://...)." }),
});

export const browserGotoTool: AppTool<typeof GotoParams> = {
  name: "browser/goto",
  label: "Navigate Browser",
  description:
    "Navigate the active browser artifact to the given URL. If no browser artifact exists yet, this tool fails — call browser/open first. The agent receives the latest observation (screenshot + URL/title) when navigation completes.",
  riskLevel: "high",
  parameters: GotoParams,
  async execute(toolCallId, params) {
    const { url, artifactId } = params as { artifactId?: string; url: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const state = await manager.attachArtifact(resolved.sessionId, resolved.artifactId, { url });
    const observation = await manager.observe(resolved.sessionId, resolved.artifactId);
    return {
      content: [
        {
          text: `Navigated browser to ${observation.url || url}`,
          type: "text",
        },
      ],
      details: {
        action: "goto",
        artifactId: resolved.artifactId,
        assistantBlock: {
          props: {
            a11yText: observation.a11yText,
            action: "goto",
            screenshotDataUrl: observation.screenshotDataUrl,
            title: observation.title,
            url: observation.url,
          },
          type: "browser_action",
        },
        observation,
        state,
        toolCallId,
        url,
      },
    };
  },
};