import type { BrowserWindow, WebContentsView } from "electron";
import Emittery from "emittery";

import type { BrowserManager } from "../browser-manager.js";
import type {
  BrowserState,
  ControlMode,
  Observation,
  TabInfo,
  ToolAction,
} from "@shared/browser-artifact-ipc";

import { CDPClient } from "./cdp/cdp-client.js";
import { captureJpegScreenshot } from "./cdp/screenshot.js";
import { waitForLoad } from "./cdp/navigation.js";
import { BrowserObserver } from "./observer/observer.js";
import { ObservationStore } from "./observer/observation-store.js";
import { BrowserOperator } from "./operator/operator.js";
import { ActionGuard } from "./operator/action-guard.js";
import { BrowserAllowlist } from "./permissions/allowlist.js";
import { SensitiveDomainMatcher } from "./permissions/sensitive-domains.js";
import { BrowserSession } from "./session.js";
import { Tab } from "./tab.js";

export interface BrowserSessionManagerEvents {
  browser_tab_changed: {
    sessionId: string;
    artifactId: string;
    tabs: TabInfo[];
    activeTabId: string;
  };
  browser_screenshot_updated: {
    sessionId: string;
    artifactId: string;
    tabId: string;
    screenshotDataUrl: string;
  };
}

type BrowserKey = `${string}:${string}`;

function getKey(sessionId: string, artifactId: string): BrowserKey {
  return `${sessionId}:${artifactId}` as BrowserKey;
}

/**
 * Orchestration layer on top of the existing `BrowserManager`. Owns per-artifact
 * session state (control mode, multi-tab registry, latest observation) and the
 * CDP automation. Reuses `BrowserManager` for the first tab's WebContentsView
 * lifecycle (URL allow-list, navigation primitives, state events).
 *
 * Phase C: multi-tab. The first tab lives on BrowserManager's view; subsequent
 * tabs spawn dedicated WebContentsViews that share the artifact's bounds.
 */
export class BrowserSessionManager extends Emittery<BrowserSessionManagerEvents> {
  private sessions = new Map<BrowserKey, BrowserSession>();
  private extraViews = new Map<BrowserKey, Map<string, WebContentsView>>();
  private observer = new BrowserObserver();
  private store = new ObservationStore();
  private allowlist = new BrowserAllowlist();
  private sensitive = new SensitiveDomainMatcher();

  constructor(
    private browserManager: BrowserManager,
    private browserWindow: BrowserWindow,
  ) {
    super();
  }

  // ── Session lifecycle ──────────────────────────────────────────────────

  async attachArtifact(
    sessionId: string,
    artifactId: string,
    content: { url: string },
  ): Promise<BrowserState> {
    const existing = this.sessions.get(getKey(sessionId, artifactId));
    if (existing) {
      const currentUrl = existing.activeTab.url();
      if (currentUrl !== content.url) {
        await this.browserManager.navigate(sessionId, artifactId, content.url);
      }
      return this.snapshotState(sessionId, artifactId);
    }

    const state = await this.browserManager.create(sessionId, artifactId, {
      title: undefined,
      url: content.url,
    });

    const guard = new ActionGuard(this.allowlist);
    const operator = new BrowserOperator(this.observer, this.store, guard);
    const session = await BrowserSession.createInitial(
      sessionId,
      artifactId,
      this.browserManager,
      this.observer,
      this.store,
      operator,
      guard,
    );
    this.sessions.set(getKey(sessionId, artifactId), session);
    this.extraViews.set(getKey(sessionId, artifactId), new Map());

    await waitForLoad(session.activeTab.webContents, 5000);

    // Sensitive domain auto-pause.
    await this.checkSensitiveAndPause(sessionId, artifactId);

    void this.broadcastScreenshot(sessionId, artifactId);

    return this.snapshotState(sessionId, artifactId);
  }

  async detachArtifact(sessionId: string, artifactId: string): Promise<void> {
    const session = this.sessions.get(getKey(sessionId, artifactId));
    const extras = this.extraViews.get(getKey(sessionId, artifactId));
    if (extras) {
      for (const view of extras.values()) {
        this.browserWindow.contentView.removeChildView(view);
        view.webContents.close();
      }
      this.extraViews.delete(getKey(sessionId, artifactId));
    }
    if (!session) {
      await this.browserManager.destroy(sessionId, artifactId);
      return;
    }
    for (const tab of session.tabs.values()) {
      await tab.dispose();
    }
    this.sessions.delete(getKey(sessionId, artifactId));
    await this.browserManager.destroy(sessionId, artifactId);
  }

  async destroySession(sessionId: string): Promise<void> {
    const keys = [...this.sessions.keys()].filter((k) => k.startsWith(`${sessionId}:`));
    await Promise.all(
      keys.map(async (k) => {
        const [, artifactId] = k.split(":");
        await this.detachArtifact(sessionId, artifactId);
      }),
    );
  }

  // ── Tool entry points ──────────────────────────────────────────────────

  async observe(
    sessionId: string,
    artifactId: string,
    opts?: { selector?: string; maxRefs?: number },
  ): Promise<Observation> {
    const session = this.requireSession(sessionId, artifactId);
    const observation = await this.observer.refresh(session.activeTab, opts ?? {});
    this.store.set(session.activeTab.id, observation);
    void this.broadcastScreenshot(sessionId, artifactId, observation.screenshotDataUrl);
    return observation;
  }

  async dispatch(
    sessionId: string,
    artifactId: string,
    action: ToolAction,
  ): Promise<{ state: BrowserState; observation: Observation }> {
    const session = this.requireSession(sessionId, artifactId);
    const observation = await session.operator.dispatch(session.activeTab, action);
    this.store.set(session.activeTab.id, observation);
    void this.broadcastScreenshot(sessionId, artifactId, observation.screenshotDataUrl);
    return {
      observation,
      state: this.snapshotState(sessionId, artifactId),
    };
  }

  async setMode(sessionId: string, artifactId: string, mode: ControlMode): Promise<void> {
    const session = this.requireSession(sessionId, artifactId);
    session.activeTab.setMode(mode);
    await this.emit("browser_tab_changed", {
      activeTabId: session.activeTabId,
      artifactId,
      sessionId,
      tabs: session.tabInfos(),
    });
  }

  // ── Multi-tab ──────────────────────────────────────────────────────────

  async openTab(sessionId: string, artifactId: string, url: string): Promise<TabInfo> {
    const session = this.requireSession(sessionId, artifactId);

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    this.browserWindow.contentView.addChildView(view);
    view.setBounds({ height: 0, width: 0, x: 0, y: 0 });

    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    const cdp = new CDPClient(view.webContents);
    await cdp.attach();
    await cdp.enableDomains();

    const tab = new Tab(view.webContents, cdp);
    session.tabs.set(tab.id, tab);
    this.extraViews.get(getKey(sessionId, artifactId))?.set(tab.id, view);

    await view.webContents.loadURL(url);
    await waitForLoad(view.webContents, 5000);
    session.activeTabId = tab.id;

    await this.emit("browser_tab_changed", {
      activeTabId: session.activeTabId,
      artifactId,
      sessionId,
      tabs: session.tabInfos(),
    });
    void this.broadcastScreenshot(sessionId, artifactId);

    return {
      active: true,
      id: tab.id,
      title: tab.title(),
      url: tab.url(),
    };
  }

  async switchTab(sessionId: string, artifactId: string, tabId: string): Promise<void> {
    const session = this.requireSession(sessionId, artifactId);
    if (!session.tabs.has(tabId)) throw new Error(`Unknown tab: ${tabId}`);

    // Hide all non-active tabs (set 0 bounds). The BrowserArtifact renderer is
    // responsible for pushing bounds via browserSetBounds; we mirror them here
    // for the *active* tab. For the first tab the BrowserManager owns the
    // view; for additional tabs we read the bounds from its records.
    const firstTabBounds = (this.browserManager as unknown as {
      records: Map<string, { bounds: { height: number; width: number; x: number; y: number } }>;
    }).records.get(getKey(sessionId, artifactId))?.bounds ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    };
    for (const [id, tab] of session.tabs) {
      const view = this.viewForTab(sessionId, artifactId, id);
      if (!view) continue;
      if (id === tabId) {
        view.setBounds(firstTabBounds);
        tab.setMode(tab.controlMode || "agent");
      } else {
        view.setBounds({ height: 0, width: 0, x: 0, y: 0 });
      }
    }
    session.activeTabId = tabId;
    await this.emit("browser_tab_changed", {
      activeTabId: tabId,
      artifactId,
      sessionId,
      tabs: session.tabInfos(),
    });
  }

  async closeTab(sessionId: string, artifactId: string, tabId?: string): Promise<void> {
    const session = this.requireSession(sessionId, artifactId);
    const target = tabId ?? session.activeTabId;
    const tab = session.tabs.get(target);
    if (!tab) return;
    const view = this.viewForTab(sessionId, artifactId, target);
    if (view) {
      this.browserWindow.contentView.removeChildView(view);
      this.extraViews.get(getKey(sessionId, artifactId))?.delete(target);
    }
    await tab.dispose();
    session.tabs.delete(target);
    if (session.activeTabId === target) {
      const next = session.tabs.keys().next().value ?? "";
      session.activeTabId = next;
      if (next) {
        await this.switchTab(sessionId, artifactId, next);
        return;
      }
    }
    await this.emit("browser_tab_changed", {
      activeTabId: session.activeTabId,
      artifactId,
      sessionId,
      tabs: session.tabInfos(),
    });
  }

  async listTabs(sessionId: string, artifactId: string): Promise<TabInfo[]> {
    const session = this.sessions.get(getKey(sessionId, artifactId));
    return session ? session.tabInfos() : [];
  }

  /**
   * Returns the active tab for a session/artifact pair. Throws if no session
   * exists. Used by tools that need direct WebContents access (e.g. wait).
   */
  requireActiveTab(sessionId: string, artifactId: string): Tab {
    return this.requireSession(sessionId, artifactId).activeTab;
  }

  // ── Allow-list mutation (Phase C) ──────────────────────────────────────

  async updateAllowlist(patch: { allow?: string[]; deny?: string[] }): Promise<void> {
    await this.allowlist.update(patch);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private requireSession(sessionId: string, artifactId: string): BrowserSession {
    const session = this.sessions.get(getKey(sessionId, artifactId));
    if (!session) {
      throw new Error(`No browser session for ${sessionId}/${artifactId}`);
    }
    return session;
  }

  snapshotState(sessionId: string, artifactId: string): BrowserState {
    const record = (this.browserManager as unknown as {
      records: Map<
        string,
        {
          view: { webContents: import("electron").WebContents };
          state: BrowserState;
        }
      >;
    }).records.get(getKey(sessionId, artifactId));
    const baseState: BrowserState = record
      ? record.state
      : {
          canGoBack: false,
          canGoForward: false,
          status: "loading",
          title: "Browser",
          url: "about:blank",
        };
    const session = this.sessions.get(getKey(sessionId, artifactId));
    const mode: ControlMode | undefined = session?.activeTab.controlMode;
    return { ...baseState, mode };
  }

  private viewForTab(
    sessionId: string,
    artifactId: string,
    tabId: string,
  ): WebContentsView | undefined {
    return this.extraViews.get(getKey(sessionId, artifactId))?.get(tabId);
  }

  private async broadcastScreenshot(
    sessionId: string,
    artifactId: string,
    preset?: string,
  ): Promise<void> {
    const session = this.sessions.get(getKey(sessionId, artifactId));
    if (!session) return;
    const tab = session.activeTab;
    let screenshotDataUrl = preset;
    if (!screenshotDataUrl) {
      try {
        screenshotDataUrl = await captureJpegScreenshot(tab.cdp, 70);
      } catch {
        return;
      }
    }
    await this.emit("browser_screenshot_updated", {
      artifactId,
      screenshotDataUrl,
      sessionId,
      tabId: tab.id,
    });
  }

  private async checkSensitiveAndPause(
    sessionId: string,
    artifactId: string,
  ): Promise<boolean> {
    const session = this.sessions.get(getKey(sessionId, artifactId));
    if (!session) return false;
    const url = session.activeTab.url();
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      return false;
    }
    if (this.sensitive.isSensitive(host)) {
      session.activeTab.setMode("user");
      return true;
    }
    return false;
  }
}