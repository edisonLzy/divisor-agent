import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const CloseTabParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
  tabId: Type.Optional(
    Type.String({
      description: "Tab id to close. Defaults to the active tab.",
    }),
  ),
});

export const browserCloseTabTool: AppTool<typeof CloseTabParams> = {
  name: "browser/close_tab",
  label: "Close Browser Tab",
  description: "Close a tab in the active browser artifact. Defaults to the active tab.",
  riskLevel: "medium",
  parameters: CloseTabParams,
  async execute(toolCallId, params) {
    const { artifactId, tabId } = params as { artifactId?: string; tabId?: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    await manager.closeTab(resolved.sessionId, resolved.artifactId, tabId);
    return {
      content: [{ text: `Closed tab ${tabId ?? "active"}`, type: "text" }],
      details: {
        action: "close_tab",
        artifactId: resolved.artifactId,
        tabId: tabId ?? null,
        toolCallId,
      },
    };
  },
};