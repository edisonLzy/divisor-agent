import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  app,
  dialog,
  nativeImage,
  session,
  shell,
  WebContentsView,
  type BrowserWindow,
} from "electron";

import type {
  BrowserAnnotationViewportBridgeEvent,
  BrowserAnnotationViewportBridgeMarker,
  BrowserElementSelection,
  BrowserGetProperty,
  BrowserNavigationAction,
  BrowserProfile,
  BrowserRect,
  BrowserState,
  BrowserTab,
  DetectedChromiumProfile,
} from "../common/types";
import {
  BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX,
  buildBrowserAnnotationViewportBridgeScript,
} from "./annotation-viewport-bridge";
import { detectChromiumProfiles, importChromiumCookies } from "./cookie-import";
import { cancelElementSelection, selectElement } from "./element-selection";
import { SnapshotService } from "./snapshot";
import { BrowserOperationError, normalizeBrowserUrl } from "./url";

interface PersistedState {
  activeTabBySession: Record<string, string>;
  profiles: BrowserProfile[];
  tabs: Array<Pick<BrowserTab, "id" | "profileId" | "sessionId" | "title" | "url">>;
}

interface ManagedTab {
  state: BrowserTab;
  view: WebContentsView;
}

const DEFAULT_PROFILE: BrowserProfile = {
  id: "default",
  label: "Default",
  partition: "persist:divisor-browser-default",
};

export class BrowserManager {
  private activeTabBySession = new Map<string, string>();
  private profiles = new Map<string, BrowserProfile>();
  private tabs = new Map<string, ManagedTab>();
  private snapshotService = new SnapshotService();
  private detectedProfiles = new Map<string, DetectedChromiumProfile>();
  private attachedView: WebContentsView | null = null;
  private annotationViewportTokens = new Map<string, string>();
  private destroying = false;
  private surface: { rect: BrowserRect; sessionId: string; tabId: string } | null = null;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private onStateChanged: (sessionId: string, state: BrowserState) => void,
    private onAnnotationViewportEvent: (
      event: BrowserAnnotationViewportBridgeEvent,
    ) => void = () => {},
  ) {
    this.load();
  }

  createTab(sessionId: string, url?: string, profileId = "default"): BrowserTab {
    const profile = this.requireProfile(profileId);
    const id = randomUUID();
    const normalizedUrl = normalizeBrowserUrl(url);
    const state: BrowserTab = {
      canGoBack: false,
      canGoForward: false,
      id,
      isLoading: true,
      profileId: profile.id,
      sessionId,
      title: "New Tab",
      url: normalizedUrl,
    };
    const view = this.createView(state, profile);
    this.tabs.set(id, { state, view });
    this.activeTabBySession.set(sessionId, id);
    void view.webContents.loadURL(normalizedUrl).catch((error) => {
      this.failNavigation(id, error);
    });
    this.persist();
    this.emit(sessionId);
    return { ...state };
  }

  closeTab(sessionId: string, tabId: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    this.detach(tab.view);
    this.tabs.delete(tabId);
    this.annotationViewportTokens.delete(tabId);
    this.snapshotService.clear(tabId);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (this.activeTabBySession.get(sessionId) === tabId) {
      const replacement = [...this.tabs.values()].find(
        (candidate) => candidate.state.sessionId === sessionId,
      );
      if (replacement) this.activeTabBySession.set(sessionId, replacement.state.id);
      else this.activeTabBySession.delete(sessionId);
    }
    this.persist();
    this.emit(sessionId);
  }

  setActiveTab(sessionId: string, tabId: string) {
    this.requireOwnedTab(sessionId, tabId);
    this.activeTabBySession.set(sessionId, tabId);
    if (this.surface?.sessionId === sessionId) {
      this.surface.tabId = tabId;
      this.showSurface(this.surface);
    }
    this.persist();
    this.emit(sessionId);
  }

  getState(sessionId: string): BrowserState {
    return {
      activeTabId: this.activeTabBySession.get(sessionId) ?? null,
      profiles: [...this.profiles.values()].map((profile) => ({ ...profile })),
      tabs: [...this.tabs.values()]
        .filter((tab) => tab.state.sessionId === sessionId)
        .map((tab) => ({ ...tab.state })),
    };
  }

  async navigate(sessionId: string, tabId: string, action: BrowserNavigationAction, url?: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    const contents = tab.view.webContents;
    try {
      if (action === "goto") await contents.loadURL(normalizeBrowserUrl(url));
      else if (action === "back" && contents.navigationHistory.canGoBack())
        contents.navigationHistory.goBack();
      else if (action === "forward" && contents.navigationHistory.canGoForward())
        contents.navigationHistory.goForward();
      else if (action === "reload") contents.reload();
    } catch (error) {
      throw new BrowserOperationError(
        "browser_navigation_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  setSurface(input: { rect?: BrowserRect; sessionId: string; tabId?: string; visible: boolean }) {
    if (!input.visible || !input.rect || !input.tabId) {
      this.surface = null;
      this.detach(this.attachedView);
      return;
    }
    if (!isValidRect(input.rect)) throw new Error("Invalid browser surface bounds");
    this.requireOwnedTab(input.sessionId, input.tabId);
    this.surface = { rect: input.rect, sessionId: input.sessionId, tabId: input.tabId };
    this.showSurface(this.surface);
  }

  createProfile(label: string): BrowserProfile {
    const normalizedLabel = requireLabel(label);
    const id = randomUUID();
    const profile = {
      id,
      label: normalizedLabel,
      partition: `persist:divisor-browser-${id}`,
    };
    this.configureSession(profile);
    this.profiles.set(id, profile);
    this.persist();
    this.emitAll();
    return { ...profile };
  }

  renameProfile(id: string, label: string): BrowserProfile {
    const profile = this.requireProfile(id);
    profile.label = requireLabel(label);
    this.persist();
    this.emitAll();
    return { ...profile };
  }

  deleteProfile(id: string) {
    if (id === "default") throw new Error("The default browser profile cannot be deleted");
    this.requireProfile(id);
    if ([...this.tabs.values()].some((tab) => tab.state.profileId === id)) {
      throw new Error("Close or move tabs using this profile before deleting it");
    }
    this.profiles.delete(id);
    this.persist();
    this.emitAll();
  }

  setTabProfile(sessionId: string, tabId: string, profileId: string): BrowserTab {
    const managed = this.requireOwnedTab(sessionId, tabId);
    const profile = this.requireProfile(profileId);
    const url = managed.state.url;
    const wasAttached = this.attachedView === managed.view;
    this.detach(managed.view);
    if (!managed.view.webContents.isDestroyed()) managed.view.webContents.close();
    managed.state = { ...managed.state, isLoading: true, profileId };
    managed.view = this.createView(managed.state, profile);
    this.snapshotService.clear(tabId);
    void managed.view.webContents.loadURL(url).catch((error) => this.failNavigation(tabId, error));
    if (wasAttached && this.surface) this.showSurface(this.surface);
    this.persist();
    this.emit(sessionId);
    return { ...managed.state };
  }

  detectChromiumProfiles() {
    const profiles = detectChromiumProfiles();
    this.detectedProfiles = new Map(profiles.map((profile) => [profile.id, profile]));
    return profiles.map((profile) => ({ ...profile }));
  }

  async importChromiumCookies(profileId: string, sourceId: string) {
    const profile = this.requireProfile(profileId);
    const source = this.detectedProfiles.get(sourceId);
    if (!source) throw new Error("Detect browser profiles again before importing cookies");
    const confirmation = await dialog.showMessageBox({
      buttons: ["Import", "Cancel"],
      cancelId: 1,
      defaultId: 1,
      detail: `Source: ${source.label}\nTarget: ${profile.label}\nOnly cookies will be imported.`,
      message: "Import browser cookies?",
      type: "warning",
    });
    if (confirmation.response !== 0) return { imported: 0, total: 0, skipped: 0, domains: [] };
    return importChromiumCookies(source, profile);
  }

  async snapshot(sessionId: string, tabId?: string) {
    const tab = this.resolveTab(sessionId, tabId);
    const result = await this.snapshotService.snapshot(tab.state.id, tab.view.webContents);
    return { ...result, browserPageId: tab.state.id, title: tab.state.title, url: tab.state.url };
  }

  async get(sessionId: string, ref: string, property: BrowserGetProperty, tabId?: string) {
    const tab = this.resolveTab(sessionId, tabId);
    const value = await this.snapshotService.get(tab.state.id, tab.view.webContents, ref, property);
    return { browserPageId: tab.state.id, property, ref, value };
  }

  async screenshot(sessionId: string, tabId?: string, fullPage = false) {
    const tab = this.resolveTab(sessionId, tabId);
    const contents = tab.view.webContents;
    let image: Electron.NativeImage;
    if (!fullPage) {
      image = await contents.capturePage();
    } else {
      if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
      const metrics = (await contents.debugger.sendCommand("Page.getLayoutMetrics")) as {
        cssContentSize?: { height: number; width: number; x: number; y: number };
      };
      const size = metrics.cssContentSize;
      const result = (await contents.debugger.sendCommand("Page.captureScreenshot", {
        captureBeyondViewport: true,
        clip: size ? { ...size, scale: 1 } : undefined,
        format: "png",
      })) as { data: string };
      image = nativeImage.createFromBuffer(Buffer.from(result.data, "base64"));
    }
    const directory = join(app.getPath("userData"), "browser-captures");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `${tab.state.id}-${Date.now()}.png`);
    writeFileSync(path, image.toPNG());
    return { browserPageId: tab.state.id, path, title: tab.state.title, url: tab.state.url };
  }

  pageInfo(sessionId: string, tabId?: string) {
    return { ...this.resolveTab(sessionId, tabId).state };
  }

  async startElementSelection(sessionId: string, tabId: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    const result = await selectElement(tab.view.webContents);
    return {
      comment: result.comment,
      kind: result.kind as BrowserElementSelection["kind"],
      payload: result.payload,
      screenshotDataUrl: result.screenshotDataUrl,
    };
  }

  async cancelElementSelection(sessionId: string, tabId: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    await cancelElementSelection(tab.view.webContents);
  }

  async setAnnotationViewportBridge(
    browserPageId: string,
    enabled: boolean,
    markers: BrowserAnnotationViewportBridgeMarker[],
    token: string,
  ) {
    const tab = this.tabs.get(browserPageId);
    if (!tab || tab.view.webContents.isDestroyed()) return;
    if (enabled) this.annotationViewportTokens.set(browserPageId, token);
    else this.annotationViewportTokens.delete(browserPageId);
    const script = buildBrowserAnnotationViewportBridgeScript({
      emitViewport: false,
      enabled,
      markers,
      token,
    });
    await tab.view.webContents.executeJavaScript(script, true).catch(() => {});
  }

  destroy() {
    this.destroying = true;
    this.detach(this.attachedView);
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    this.tabs.clear();
  }

  private createView(state: BrowserTab, profile: BrowserProfile): WebContentsView {
    this.configureSession(profile);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: profile.partition,
        sandbox: true,
        webSecurity: true,
      },
    });
    const contents = view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      try {
        this.createTab(state.sessionId, url, state.profileId);
      } catch {
        void shell.openExternal(url).catch(() => {});
      }
      return { action: "deny" };
    });
    contents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) this.snapshotService.markNavigated(state.id);
    });
    contents.on("did-start-loading", () =>
      this.updateNavigationState(state.id, { isLoading: true }),
    );
    contents.on("did-stop-loading", () => this.updateFromContents(state.id));
    contents.on("page-title-updated", (_event, title) =>
      this.updateNavigationState(state.id, { title }),
    );
    contents.on("did-navigate", (_event, url) => {
      this.annotationViewportTokens.delete(state.id);
      this.updateNavigationState(state.id, { url });
    });
    contents.on("did-navigate-in-page", (_event, url) => {
      this.snapshotService.markNavigated(state.id);
      this.updateNavigationState(state.id, { url });
    });
    contents.on("console-message", (_event, _level, message) => {
      this.handleAnnotationViewportMessage(state.id, message);
    });
    contents.on("destroyed", () => {
      const managed = this.tabs.get(state.id);
      if (!this.destroying && managed?.view === view) {
        if (this.attachedView === view) this.attachedView = null;
        const replacement = this.createView(state, this.requireProfile(state.profileId));
        managed.view = replacement;
        state.isLoading = true;
        void replacement.webContents
          .loadURL(normalizeBrowserUrl(state.url))
          .catch((error) => this.failNavigation(state.id, error));
      }
    });
    return view;
  }

  private configureSession(profile: BrowserProfile) {
    const browserSession = session.fromPartition(profile.partition);
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    browserSession.setPermissionCheckHandler(() => false);
    if (browserSession.listenerCount("will-download") === 0) {
      browserSession.on("will-download", async (event, item) => {
        event.preventDefault();
        const result = await dialog.showSaveDialog({ defaultPath: item.getFilename() });
        if (!result.canceled && result.filePath) {
          await contentsDownload(item.getURL(), result.filePath, profile.partition);
        }
      });
    }
  }

  private showSurface(surface: { rect: BrowserRect; sessionId: string; tabId: string }) {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    const tab = this.requireOwnedTab(surface.sessionId, surface.tabId);
    if (this.attachedView !== tab.view) {
      this.detach(this.attachedView);
      window.contentView.addChildView(tab.view);
      this.attachedView = tab.view;
    }
    const zoom = window.webContents.getZoomFactor();
    const contentBounds = window.getContentBounds();
    const x = clamp(Math.round(surface.rect.x * zoom), 0, Math.max(0, contentBounds.width - 1));
    const y = clamp(Math.round(surface.rect.y * zoom), 0, Math.max(0, contentBounds.height - 1));
    tab.view.setBounds({
      height: clamp(Math.round(surface.rect.height * zoom), 1, contentBounds.height - y),
      width: clamp(Math.round(surface.rect.width * zoom), 1, contentBounds.width - x),
      x,
      y,
    });
  }

  private detach(view: WebContentsView | null) {
    if (!view) return;
    const window = this.getWindow();
    if (window && !window.isDestroyed()) {
      try {
        window.contentView.removeChildView(view);
      } catch {
        // The view may already have been detached during window teardown.
      }
    }
    if (this.attachedView === view) this.attachedView = null;
  }

  private handleAnnotationViewportMessage(browserPageId: string, message: string) {
    const token = this.annotationViewportTokens.get(browserPageId);
    if (!token) return;
    const prefix = `${BROWSER_ANNOTATION_VIEWPORT_MESSAGE_PREFIX}${token}:`;
    if (!message.startsWith(prefix)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.slice(prefix.length));
    } catch {
      return;
    }
    if (!isAnnotationViewportEventPayload(parsed)) return;
    this.onAnnotationViewportEvent({
      browserPageId,
      comment: parsed.comment,
      markerId: parsed.markerId,
      type: parsed.type,
    });
  }

  private resolveTab(sessionId: string, tabId?: string) {
    const resolvedId = tabId ?? this.activeTabBySession.get(sessionId);
    if (!resolvedId)
      throw new BrowserOperationError("browser_page_closed", "No browser tab is open");
    return this.requireOwnedTab(sessionId, resolvedId);
  }

  private requireOwnedTab(sessionId: string, tabId: string): ManagedTab {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.state.sessionId !== sessionId || tab.view.webContents.isDestroyed()) {
      throw new BrowserOperationError(
        "browser_page_closed",
        `Browser page ${tabId} is unavailable`,
      );
    }
    return tab;
  }

  private requireProfile(id: string): BrowserProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Browser profile not found: ${id}`);
    return profile;
  }

  private updateFromContents(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) return;
    const contents = tab.view.webContents;
    this.updateNavigationState(tabId, {
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      isLoading: contents.isLoading(),
      title: contents.getTitle() || tab.state.title,
      url: contents.getURL() || tab.state.url,
    });
  }

  private updateNavigationState(tabId: string, update: Partial<BrowserTab>) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    Object.assign(tab.state, update);
    this.persist();
    this.emit(tab.state.sessionId);
  }

  private failNavigation(tabId: string, error: unknown) {
    this.updateNavigationState(tabId, {
      isLoading: false,
      title: error instanceof Error ? error.message : "Navigation failed",
    });
  }

  private emit(sessionId: string) {
    this.onStateChanged(sessionId, this.getState(sessionId));
  }

  private emitAll() {
    for (const sessionId of new Set([...this.tabs.values()].map((tab) => tab.state.sessionId))) {
      this.emit(sessionId);
    }
  }

  private get statePath() {
    return join(app.getPath("userData"), "browser-extension.json");
  }

  private load() {
    let persisted: PersistedState | null = null;
    try {
      persisted = JSON.parse(readFileSync(this.statePath, "utf8")) as PersistedState;
    } catch {
      // First run or invalid state: start with the safe default profile.
    }
    const profiles = [
      DEFAULT_PROFILE,
      ...(persisted?.profiles ?? []).filter((p) => p.id !== "default"),
    ];
    for (const profile of profiles) {
      this.profiles.set(profile.id, { ...profile });
      this.configureSession(profile);
    }
    for (const [sessionId, tabId] of Object.entries(persisted?.activeTabBySession ?? {})) {
      this.activeTabBySession.set(sessionId, tabId);
    }
    for (const saved of persisted?.tabs ?? []) {
      const profile = this.profiles.get(saved.profileId) ?? DEFAULT_PROFILE;
      const state: BrowserTab = {
        ...saved,
        canGoBack: false,
        canGoForward: false,
        isLoading: true,
      };
      const view = this.createView(state, profile);
      this.tabs.set(state.id, { state, view });
      void view.webContents
        .loadURL(normalizeBrowserUrl(saved.url))
        .catch((error) => this.failNavigation(state.id, error));
    }
  }

  private persist() {
    try {
      const payload: PersistedState = {
        activeTabBySession: Object.fromEntries(this.activeTabBySession),
        profiles: [...this.profiles.values()],
        tabs: [...this.tabs.values()].map(({ state }) => ({
          id: state.id,
          profileId: state.profileId,
          sessionId: state.sessionId,
          title: state.title,
          url: state.url,
        })),
      };
      const temporary = `${this.statePath}.tmp`;
      writeFileSync(temporary, JSON.stringify(payload));
      renameSync(temporary, this.statePath);
    } catch {
      // Persistence must not break browsing.
    }
  }
}

function requireLabel(label: string) {
  const normalized = label.trim().slice(0, 80);
  if (!normalized) throw new Error("Profile label is required");
  return normalized;
}

function isValidRect(rect: BrowserRect) {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function isAnnotationViewportEventPayload(
  value: unknown,
): value is { comment?: string; markerId: string; type: "delete" | "open" | "save" } {
  if (!value || typeof value !== "object") return false;
  const payload = value as { comment?: unknown; markerId?: unknown; type?: unknown };
  return (
    typeof payload.markerId === "string" &&
    (payload.type === "delete" || payload.type === "open" || payload.type === "save") &&
    (payload.comment === undefined || typeof payload.comment === "string")
  );
}

async function contentsDownload(url: string, path: string, partition: string) {
  const response = await session.fromPartition(partition).fetch(url);
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}
