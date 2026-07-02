import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const SwitchTabParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  tabId: Type.String({ description: "Tab id to switch to (use browser/list_tabs to find)." }),
});

export const browserSwitchTabTool: AppTool<typeof SwitchTabParams> = {
  name: "browser/switch_tab",
  label: "Switch Browser Tab",
  description:
    "Switch the active tab inside the browser artifact. Subsequent browser/* tools target the new tab.",
  riskLevel: "medium",
  parameters: SwitchTabParams,
  async execute(toolCallId, params) {
    const { artifactId, tabId } = params as { artifactId?: string; tabId: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    await manager.switchTab(resolved.sessionId, resolved.artifactId, tabId);
    return {
      content: [{ text: `Switched to tab ${tabId}`, type: "text" }],
      details: {
        action: "switch_tab",
        artifactId: resolved.artifactId,
        tabId,
        toolCallId,
      },
    };
  },
};