import type { BrowserWindow } from "electron";
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
 * CDP automation. Reuses `BrowserManager` for WebContentsView lifecycle and
 * the navigation primitives that Phase 1 already wired up.
 */
export class BrowserSessionManager extends Emittery<BrowserSessionManagerEvents> {
  private sessions = new Map<BrowserKey, BrowserSession>();
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
      // Already attached; if URL differs, navigate.
      const currentUrl = existing.activeTab.url();
      if (currentUrl !== content.url) {
        await this.browserManager.navigate(sessionId, artifactId, content.url);
      }
      return this.snapshotState(sessionId, artifactId);
    }

    // Phase A: reuse the existing BrowserManager flow for the first view.
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

    // Wait for the initial load to settle so the first observation is meaningful.
    await waitForLoad(session.activeTab.webContents, 5000);
    void this.broadcastScreenshot(sessionId, artifactId);

    return this.snapshotState(sessionId, artifactId);
  }

  async detachArtifact(sessionId: string, artifactId: string): Promise<void> {
    const session = this.sessions.get(getKey(sessionId, artifactId));
    if (!session) {
      // Nothing on our side; let BrowserManager tear down the view.
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
    _opts?: { selector?: string; maxRefs?: number },
  ): Promise<Observation> {
    const session = this.requireSession(sessionId, artifactId);
    const observation = await this.observer.refresh(session.activeTab);
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
    session.activeTab.refMap = new Map(Object.entries(observation.refMap));
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

  // ── Multi-tab (Phase C — minimal Phase A stub) ─────────────────────────

  async openTab(_sessionId: string, _artifactId: string, _url: string): Promise<TabInfo> {
    // Phase A: only single tab. Phase C will create new WebContentsViews.
    throw new Error("browser/open_tab is not implemented yet (Phase C)");
  }

  async switchTab(sessionId: string, artifactId: string, tabId: string): Promise<void> {
    const session = this.requireSession(sessionId, artifactId);
    if (!session.tabs.has(tabId)) throw new Error(`Unknown tab: ${tabId}`);
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
    await tab.dispose();
    session.tabs.delete(target);
    if (session.activeTabId === target) {
      session.activeTabId = session.tabs.keys().next().value ?? "";
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
    if (!record) {
      return {
        canGoBack: false,
        canGoForward: false,
        status: "loading",
        title: "Browser",
        url: "about:blank",
      };
    }
    const session = this.sessions.get(getKey(sessionId, artifactId));
    const mode: ControlMode | undefined = session?.activeTab.controlMode;
    return { ...record.state, mode };
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
      screenshotDataUrl = await session.refreshAndBroadcastScreenshot();
      if (!screenshotDataUrl) return;
    }
    await this.emit("browser_screenshot_updated", {
      artifactId,
      screenshotDataUrl,
      sessionId,
      tabId: tab.id,
    });
  }

  // ── Sensitive-domain auto-pause ────────────────────────────────────────

  async checkSensitiveAndPause(sessionId: string, artifactId: string): Promise<boolean> {
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