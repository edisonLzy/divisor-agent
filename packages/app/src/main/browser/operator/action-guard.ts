import type { Tab } from "../tab.js";
import type { ToolAction } from "@shared/browser-artifact-ipc";
import { ControlModeError } from "../control-mode.js";
import type { BrowserAllowlist } from "../permissions/allowlist.js";

/**
 * Pre-dispatch checks. Throws ControlModeError when agent tries to act in a
 * non-agent mode; returns `{ error: "domain not allowed" }` when the URL is
 * blocked by the allow-list (so the LLM sees a normal tool error rather than
 * an exception).
 */
export class ActionGuard {
  constructor(private allowlist: BrowserAllowlist) {}

  assertMode(tab: Tab, action: ToolAction): void {
    if (tab.controlMode !== "agent") {
      throw new ControlModeError(
        `Cannot dispatch "${action.kind}" while controlMode is "${tab.controlMode}"`,
      );
    }
  }

  async assertUrl(tab: Tab, action: ToolAction): Promise<{ error?: string }> {
    if (action.kind !== "goto" && action.kind !== "open_tab") return {};
    let url: URL;
    try {
      url = new URL(action.url);
    } catch {
      return { error: `Invalid URL: ${action.url}` };
    }
    if (!(await this.allowlist.isAllowed(url.host))) {
      return { error: `Domain not allowed: ${url.host}` };
    }
    return {};
  }
}