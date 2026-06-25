import type { Observation, ToolAction } from "@shared/browser-artifact-ipc";

import { resolveRef } from "../cdp/ref-map.js";
import { waitForLoad } from "../cdp/navigation.js";
import { ControlModeError } from "../control-mode.js";
import type { BrowserObserver } from "../observer/observer.js";
import type { ObservationStore } from "../observer/observation-store.js";
import type { Tab } from "../tab.js";
import type { ActionGuard } from "./action-guard.js";

/**
 * Dispatches a `ToolAction` against a Tab's WebContents via the CDP client.
 * After every action we refresh the observation (screenshot + a11y) so the
 * next LLM turn sees the latest state.
 */
export class BrowserOperator {
  constructor(
    private observer: BrowserObserver,
    private store: ObservationStore,
    private guard: ActionGuard,
  ) {}

  async dispatch(tab: Tab, action: ToolAction): Promise<Observation> {
    this.guard.assertMode(tab, action);
    const urlCheck = await this.guard.assertUrl(tab, action);
    if ("error" in urlCheck) {
      throw new Error(urlCheck.error);
    }

    switch (action.kind) {
      case "goto":
        await tab.cdp.navigate(action.url);
        await waitForLoad(tab.webContents, 5000);
        break;
      case "back":
        if (tab.webContents.canGoBack()) {
          tab.webContents.goBack();
          await waitForLoad(tab.webContents, 5000);
        }
        break;
      case "forward":
        if (tab.webContents.canGoForward()) {
          tab.webContents.goForward();
          await waitForLoad(tab.webContents, 5000);
        }
        break;
      case "click":
        await this.clickByRef(tab, action.ref);
        await waitForLoad(tab.webContents, 1500);
        break;
      case "type":
        await this.typeByRef(tab, action.ref, action.text);
        if (action.submit) {
          await tab.cdp.dispatchKeyEvent("keyDown", 0, { key: "Enter", code: "Enter" });
          await tab.cdp.dispatchKeyEvent("keyUp", 0, { key: "Enter", code: "Enter" });
          await waitForLoad(tab.webContents, 1500);
        }
        break;
      case "press":
        await tab.cdp.dispatchKeyEvent("keyDown", 0, {
          code: codeForKey(action.key),
          key: action.key,
        });
        await tab.cdp.dispatchKeyEvent("keyUp", 0, {
          code: codeForKey(action.key),
          key: action.key,
        });
        await waitForLoad(tab.webContents, 1000);
        break;
      case "scroll":
        await tab.cdp.evaluate(`window.scrollBy(0, ${action.dy})`);
        if (action.ref) {
          const { objectId } = await resolveRef(tab.cdp, tab.refMap, action.ref);
          await tab.cdp.callFunctionOn(objectId, "function() { this.scrollIntoView({block: 'center'}); }");
        }
        break;
      case "wait": {
        const timeoutMs = action.timeoutMs ?? 5000;
        if (action.selector) {
          await this.waitForSelector(tab, action.selector, timeoutMs);
        } else {
          await waitForLoad(tab.webContents, timeoutMs);
        }
        break;
      }
      case "extract":
      case "observe":
        // No-op: handled by the caller (Observer.refresh).
        break;
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action: ${JSON.stringify(_exhaustive)}`);
      }
    }

    const observation = await this.observer.refresh(tab);
    this.store.set(tab.id, observation);
    return observation;
  }

  private async clickByRef(tab: Tab, ref: string): Promise<void> {
    const { cx, cy } = await resolveRef(tab.cdp, tab.refMap, ref);
    await tab.cdp.dispatchMouseEvent("mouseMoved", cx, cy);
    await tab.cdp.dispatchMouseEvent("mousePressed", cx, cy, "left", 1);
    await tab.cdp.dispatchMouseEvent("mouseReleased", cx, cy, "left", 1);
  }

  private async typeByRef(tab: Tab, ref: string, text: string): Promise<void> {
    const { objectId } = await resolveRef(tab.cdp, tab.refMap, ref);
    await tab.cdp.callFunctionOn(objectId, "function() { this.focus(); }");
    for (const ch of text) {
      await tab.cdp.dispatchKeyEvent("char", 0, { text: ch });
    }
  }

  private async waitForSelector(tab: Tab, selector: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { result } = await tab.cdp.evaluate<boolean>(
        `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      );
      if (result.value) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Selector "${selector}" did not appear within ${timeoutMs}ms`);
  }
}

function codeForKey(key: string): string | undefined {
  switch (key) {
    case "Enter":
    case "Tab":
    case "Escape":
    case "Backspace":
    case "Delete":
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
    case "Home":
    case "End":
    case "PageUp":
    case "PageDown":
    case "Space":
      return key;
    default:
      return undefined;
  }
}

// Re-export to silence unused-import warnings if any consumer imports from here.
export { ControlModeError };