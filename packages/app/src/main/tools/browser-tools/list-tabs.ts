import { Type } from "@earendil-works/pi-ai";

import { getBrowserSessionManager } from "../../browser/ipc/register.js";
import type { AppTool } from "../types.js";
import { resolveBrowserArtifact } from "./artifact-registry.js";

const ListTabsParams = Type.Object({
  artifactId: Type.Optional(Type.String({ description: "Stable browser artifact id." })),
});

export const browserListTabsTool: AppTool<typeof ListTabsParams> = {
  name: "browser/list_tabs",
  label: "List Browser Tabs",
  description:
    "Return the list of tabs in the active browser artifact, with the active tab marked. Use the tab id with browser/switch_tab and browser/close_tab.",
  riskLevel: "safe",
  parameters: ListTabsParams,
  async execute(toolCallId, params) {
    const { artifactId } = params as { artifactId?: string };
    const resolved = resolveBrowserArtifact(artifactId);
    const manager = getBrowserSessionManager();
    const tabs = await manager.listTabs(resolved.sessionId, resolved.artifactId);
    return {
      content: [{ text: `${tabs.length} tab(s): ${tabs.map((t) => t.id).join(", ")}`, type: "text" }],
      details: {
        action: "list_tabs",
        artifactId: resolved.artifactId,
        tabs,
        toolCallId,
      },
    };
  },
};