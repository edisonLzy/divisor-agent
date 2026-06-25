import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const OpenTabParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  url: Type.String({ description: "URL to open in the new tab." }),
});

export const browserOpenTabTool: AppTool<typeof OpenTabParams> = {
  name: "browser/open_tab",
  label: "Open Browser Tab",
  description:
    "Open `url` in a new tab inside the active browser artifact. Subsequent tools operate on the new tab until you switchTab or closeTab.",
  riskLevel: "high",
  parameters: OpenTabParams,
  async execute(toolCallId, params) {
    const { artifactId, url } = params as { artifactId?: string; url: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const tab = await manager.openTab(resolved.sessionId, resolved.artifactId, url);
    return {
      content: [{ text: `Opened new tab ${tab.id}: ${tab.title} (${tab.url})`, type: "text" }],
      details: {
        action: "open_tab",
        artifactId: resolved.artifactId,
        tab,
        toolCallId,
        url,
      },
    };
  },
};