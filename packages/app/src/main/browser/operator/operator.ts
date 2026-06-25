import type { Observation, ToolAction } from "@shared/browser-artifact-ipc";

import type { BrowserObserver } from "../observer/observer.js";
import type { ObservationStore } from "../observer/observation-store.js";
import type { Tab } from "../tab.js";
import { waitForLoad } from "../cdp/navigation.js";
import type { ActionGuard } from "./action-guard.js";
import { RefExpiredError } from "../control-mode.js";

export interface OperatorResult {
  state: Observation["url"] extends string ? { url: string; title: string } : never;
  observation: Observation;
}

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
        break;
      case "type":
        await this.typeByRef(tab, action.ref, action.text);
        break;
      case "press":
        await tab.cdp.dispatchKeyEvent("keyDown", 0, { key: action.key, code: codeForKey(action.key) });
        await tab.cdp.dispatchKeyEvent("keyUp", 0, { key: action.key, code: codeForKey(action.key) });
        break;
      case "scroll":
        await tab.cdp.evaluate(`window.scrollBy(0, ${action.dy})`);
        break;
      case "wait":
        await waitForLoad(tab.webContents, action.timeoutMs ?? 5000);
        break;
      case "extract":
      case "observe":
        // These are handled directly by BrowserObserver.refresh + return.
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
    const entry = tab.refMap.get(ref);
    if (!entry) throw new RefExpiredError(ref);
    const { object } = await tab.cdp.resolveNode(entry.backendNodeId);
    if (!object?.objectId) throw new RefExpiredError(ref);
    const { result } = await tab.cdp.callFunctionOn<[number, number, number, number]>(
      object.objectId,
      "function() { const r = this.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }",
    );
    const [x, y, w, h] = result.value;
    const cx = x + w / 2;
    const cy = y + h / 2;
    await tab.cdp.dispatchMouseEvent("mouseMoved", cx, cy);
    await tab.cdp.dispatchMouseEvent("mousePressed", cx, cy, "left", 1);
    await tab.cdp.dispatchMouseEvent("mouseReleased", cx, cy, "left", 1);
  }

  private async typeByRef(tab: Tab, ref: string, text: string): Promise<void> {
    const entry = tab.refMap.get(ref);
    if (!entry) throw new RefExpiredError(ref);
    const { object } = await tab.cdp.resolveNode(entry.backendNodeId);
    if (!object?.objectId) throw new RefExpiredError(ref);
    await tab.cdp.callFunctionOn(object.objectId, "function() { this.focus(); }");
    for (const ch of text) {
      await tab.cdp.dispatchKeyEvent("char", 0, { text: ch });
    }
  }
}

function codeForKey(key: string): string | undefined {
  if (key === "Enter") return "Enter";
  if (key === "Tab") return "Tab";
  if (key === "Escape") return "Escape";
  if (key === "Backspace") return "Backspace";
  if (key === "Delete") return "Delete";
  if (key === "ArrowUp") return "ArrowUp";
  if (key === "ArrowDown") return "ArrowDown";
  if (key === "ArrowLeft") return "ArrowLeft";
  if (key === "ArrowRight") return "ArrowRight";
  if (key === "Home") return "Home";
  if (key === "End") return "End";
  if (key === "PageUp") return "PageUp";
  if (key === "PageDown") return "PageDown";
  if (key === "Space") return "Space";
  return undefined;
}