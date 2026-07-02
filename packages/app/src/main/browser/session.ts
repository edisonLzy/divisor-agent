import { BrowserManager } from "../browser-manager.js";
import type { TabInfo } from "@shared/browser-artifact-ipc";

import type { BrowserObserver } from "./observer/observer.js";
import type { ObservationStore } from "./observer/observation-store.js";
import type { BrowserOperator } from "./operator/operator.js";
import type { ActionGuard } from "./operator/action-guard.js";
import { Tab } from "./tab.js";
import { captureJpegScreenshot } from "./cdp/screenshot.js";

/**
 * Per-artifact session. Phase A keeps a single Tab. Phase C will add multi-tab.
 */
export class BrowserSession {
  public readonly tabs = new Map<string, Tab>();
  public activeTabId!: string;

  constructor(
    public readonly sessionId: string,
    public readonly artifactId: string,
    public readonly browserManager: BrowserManager,
    public readonly observer: BrowserObserver,
    public readonly store: ObservationStore,
    public readonly operator: BrowserOperator,
    public readonly guard: ActionGuard,
  ) {}

  get activeTab(): Tab {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) throw new Error(`No active tab in session ${this.sessionId}/${this.artifactId}`);
    return tab;
  }

  /**
   * Phase A: reuse the WebContentsView that `BrowserManager` already created for
   * this artifact, then attach a CDPClient to it. Returns the new Tab.
   */
  static async createInitial(
    sessionId: string,
    artifactId: string,
    browserManager: BrowserManager,
    observer: BrowserObserver,
    store: ObservationStore,
    operator: BrowserOperator,
    guard: ActionGuard,
  ): Promise<BrowserSession> {
    const record = (browserManager as unknown as {
      records: Map<string, { view: { webContents: import("electron").WebContents } }>;
    }).records.get(`${sessionId}:${artifactId}`);
    if (!record) {
      throw new Error(`BrowserManager has no record for ${sessionId}/${artifactId}`);
    }
    const cdp = new (await import("./cdp/cdp-client.js")).CDPClient(record.view.webContents);
    await cdp.attach();
    await cdp.enableDomains();

    const tab = new Tab(record.view.webContents, cdp);
    const session = new BrowserSession(
      sessionId,
      artifactId,
      browserManager,
      observer,
      store,
      operator,
      guard,
    );
    session.tabs.set(tab.id, tab);
    session.activeTabId = tab.id;
    return session;
  }

  tabInfos(): TabInfo[] {
    return [...this.tabs.values()].map((tab) => ({
      active: tab.id === this.activeTabId,
      id: tab.id,
      title: tab.title(),
      url: tab.url(),
    }));
  }

  async refreshAndBroadcastScreenshot(): Promise<string | null> {
    const tab = this.activeTab;
    try {
      const dataUrl = await captureJpegScreenshot(tab.cdp, 70);
      return dataUrl;
    } catch {
      return null;
    }
  }
}