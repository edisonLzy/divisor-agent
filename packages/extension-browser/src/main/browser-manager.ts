import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, dialog, nativeImage, session, shell, webContents, type WebContents } from "electron";

import type {
  BrowserAnnotationIntent,
  BrowserAnnotationViewportBridgeEvent,
  BrowserAnnotationViewportBridgeMarker,
  BrowserAnnotationViewportBridgeOpenPayload,
  BrowserElementSelection,
  BrowserGetProperty,
  BrowserGrabComputedStyles,
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
  // The guest webContents, owned by the renderer's <webview>. Null until the
  // renderer calls registerGuest (and after unregisterGuest / navigation that
  // recreates the guest). All main-side operations (snapshot, screenshot,
  // selection, annotation bridge) short-circuit while this is null.
  contents: WebContents | null;
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
  private annotationViewportTokens = new Map<string, string>();

  constructor(
    private getWindow: () => Electron.BrowserWindow | null,
    private onStateChanged: (sessionId: string, state: BrowserState) => void,
    private onAnnotationViewportEvent: (
      event: BrowserAnnotationViewportBridgeEvent,
    ) => void = () => {},
  ) {
    this.load();
  }

  /**
   * Open a url, reusing an existing tab in the session that already shows it
   * (or its active tab) rather than spawning a duplicate. Why: agents and the
   * initial-tab bootstrap can both call createTab, and without dedupe the same
   * url accumulates multiple identical tabs across restarts.
   */
  openOrFocus(sessionId: string, url: string, profileId = "default"): BrowserTab {
    const normalizedUrl = normalizeBrowserUrl(url);
    const existing = this.getState(sessionId).tabs.find((tab) => tab.url === normalizedUrl);
    if (existing) {
      this.setActiveTab(sessionId, existing.id);
      return { ...existing };
    }
    return this.createTab(sessionId, url, profileId);
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
    this.tabs.set(id, { state, contents: null });
    this.activeTabBySession.set(sessionId, id);
    // The renderer mounts a <webview> for this tab and calls registerGuest with
    // its webContentsId; loading happens on the renderer side via webview.src.
    this.persist();
    this.emit(sessionId);
    return { ...state };
  }

  closeTab(sessionId: string, tabId: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    this.detachGuest(tab);
    this.tabs.delete(tabId);
    this.annotationViewportTokens.delete(tabId);
    this.snapshotService.clear(tabId);
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
    const contents = tab.contents;
    if (!contents) {
      // Navigation is driven by the renderer's <webview>; main only tracks the
      // intended URL so state stays correct until the guest registers.
      if (action === "goto") tab.state.url = normalizeBrowserUrl(url);
      return;
    }
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

  // No-op under the <webview> architecture: the guest is laid out by the
  // renderer's DOM, so main no longer positions a native view. Retained only
  // to keep the IPC surface stable during the migration; renderer stops calling.
  setSurface(_input: { rect?: BrowserRect; sessionId: string; tabId?: string; visible: boolean }) {}

  registerGuest(input: {
    browserPageId: string;
    sessionId: string;
    profileId: string;
    webContentsId: number;
  }) {
    const tab = this.tabs.get(input.browserPageId);
    if (!tab) return;
    if (tab.state.sessionId !== input.sessionId) return;
    // Never adopt the host window's own webContents or an already-detached id.
    const host = this.getWindow();
    if (host && !host.isDestroyed() && host.webContents.id === input.webContentsId) return;
    const contents = webContents.fromId(input.webContentsId);
    if (!contents || contents.isDestroyed()) return;
    // If the <webview> recreated its guest (new id), detach the stale one first.
    if (tab.contents && tab.contents !== contents) this.detachGuest(tab);
    tab.contents = contents;
    tab.state.profileId = input.profileId;
    this.attachGuestListeners(tab);
    this.updateFromContents(tab.state.id);
  }

  unregisterGuest(input: { browserPageId: string }) {
    const tab = this.tabs.get(input.browserPageId);
    if (!tab) return;
    this.detachGuest(tab);
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
      throw new Error("Close or move tabs using this profile before deleting");
    }
    this.profiles.delete(id);
    this.persist();
    this.emitAll();
  }

  setTabProfile(sessionId: string, tabId: string, profileId: string): BrowserTab {
    const managed = this.requireOwnedTab(sessionId, tabId);
    // Validate the profile exists (throws if not) before swapping.
    this.requireProfile(profileId);
    // The renderer swaps the <webview> partition and re-registers the new guest.
    // Drop the old guest handle; updateFromContents runs again after re-register.
    this.detachGuest(managed);
    managed.state = { ...managed.state, isLoading: true, profileId };
    this.snapshotService.clear(tabId);
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
    const result = await this.snapshotService.snapshot(tab.state.id, this.requireContents(tab));
    return { ...result, browserPageId: tab.state.id, title: tab.state.title, url: tab.state.url };
  }

  async get(sessionId: string, ref: string, property: BrowserGetProperty, tabId?: string) {
    const tab = this.resolveTab(sessionId, tabId);
    const value = await this.snapshotService.get(
      tab.state.id,
      this.requireContents(tab),
      ref,
      property,
    );
    return { browserPageId: tab.state.id, property, ref, value };
  }

  async screenshot(sessionId: string, tabId?: string, fullPage = false) {
    const tab = this.resolveTab(sessionId, tabId);
    const contents = this.requireContents(tab);
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
    const result = await selectElement(this.requireContents(tab));
    return {
      comment: result.comment,
      kind: result.kind as BrowserElementSelection["kind"],
      payload: result.payload,
      screenshotDataUrl: result.screenshotDataUrl,
    };
  }

  async cancelElementSelection(sessionId: string, tabId: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    if (tab.contents) await cancelElementSelection(tab.contents);
  }

  async setAnnotationViewportBridge(
    browserPageId: string,
    enabled: boolean,
    markers: BrowserAnnotationViewportBridgeMarker[],
    token: string,
  ) {
    const tab = this.tabs.get(browserPageId);
    if (!tab || !tab.contents || tab.contents.isDestroyed()) return;
    if (enabled) this.annotationViewportTokens.set(browserPageId, token);
    else this.annotationViewportTokens.delete(browserPageId);
    const script = buildBrowserAnnotationViewportBridgeScript({
      emitViewport: false,
      enabled,
      markers,
      token,
    });
    await tab.contents.executeJavaScript(script, true).catch(() => {});
  }

  destroy() {
    for (const tab of this.tabs.values()) this.detachGuest(tab);
    this.tabs.clear();
  }

  private attachGuestListeners(tab: ManagedTab) {
    const contents = tab.contents;
    if (!contents) return;
    const state = tab.state;
    const onDidStartLoading = () => this.updateNavigationState(state.id, { isLoading: true });
    const onDidStopLoading = () => this.updateFromContents(state.id);
    const onPageTitle = (_e: unknown, title: string) =>
      this.updateNavigationState(state.id, { title });
    const onDidNavigate = (_e: unknown, url: string) => {
      this.annotationViewportTokens.delete(state.id);
      this.updateNavigationState(state.id, { url });
    };
    const onDidNavigateInPage = (_e: unknown, url: string) => {
      this.snapshotService.markNavigated(state.id);
      this.updateNavigationState(state.id, { url });
    };
    const onDidStartNavigation = (
      _e: unknown,
      _url: string,
      _inPlace: boolean,
      isMainFrame: boolean,
    ) => {
      if (isMainFrame) this.snapshotService.markNavigated(state.id);
    };
    const onConsoleMessage = (_e: unknown, _level: unknown, message: string) => {
      this.handleAnnotationViewportMessage(state.id, message);
    };
    const onWindowOpen = ({ url }: { url: string }) => {
      try {
        this.createTab(state.sessionId, url, state.profileId);
      } catch {
        void shell.openExternal(url).catch(() => {});
      }
      return { action: "deny" as const };
    };

    contents.setWindowOpenHandler(onWindowOpen);
    contents.on("did-start-navigation", onDidStartNavigation);
    contents.on("did-start-loading", onDidStartLoading);
    contents.on("did-stop-loading", onDidStopLoading);
    contents.on("page-title-updated", onPageTitle);
    contents.on("did-navigate", onDidNavigate);
    contents.on("did-navigate-in-page", onDidNavigateInPage);
    contents.on("console-message", onConsoleMessage);

    // Stash disposers on the contents so detachGuest can remove them when the
    // guest is recreated or the tab closes.
    (contents as unknown as { __divisorGuestListeners?: unknown }).__divisorGuestListeners = {
      onDidStartNavigation,
      onDidStartLoading,
      onDidStopLoading,
      onPageTitle,
      onDidNavigate,
      onDidNavigateInPage,
      onConsoleMessage,
    };
  }

  private detachGuest(tab: ManagedTab) {
    const contents = tab.contents;
    if (!contents) {
      tab.contents = null;
      return;
    }
    const listeners = (
      contents as unknown as { __divisorGuestListeners?: Record<string, (...a: unknown[]) => void> }
    ).__divisorGuestListeners;
    if (listeners) {
      contents.off?.("did-start-navigation", listeners.onDidStartNavigation);
      contents.off?.("did-start-loading", listeners.onDidStartLoading);
      contents.off?.("did-stop-loading", listeners.onDidStopLoading);
      contents.off?.("page-title-updated", listeners.onPageTitle);
      contents.off?.("did-navigate", listeners.onDidNavigate);
      contents.off?.("did-navigate-in-page", listeners.onDidNavigateInPage);
      contents.off?.("console-message", listeners.onConsoleMessage);
      delete (contents as unknown as { __divisorGuestListeners?: unknown }).__divisorGuestListeners;
    }
    tab.contents = null;
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
      open: parsed.type === "open" ? extractOpenPayload(parsed) : undefined,
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
    if (!tab || tab.state.sessionId !== sessionId) {
      throw new BrowserOperationError(
        "browser_page_closed",
        `Browser page ${tabId} is unavailable`,
      );
    }
    return tab;
  }

  private requireContents(tab: ManagedTab): WebContents {
    if (!tab.contents || tab.contents.isDestroyed()) {
      throw new BrowserOperationError(
        "browser_page_closed",
        "The browser page is still loading. Wait for it to finish before reading it.",
      );
    }
    return tab.contents;
  }

  private requireProfile(id: string): BrowserProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Browser profile not found: ${id}`);
    return profile;
  }

  private updateFromContents(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.contents || tab.contents.isDestroyed()) return;
    const contents = tab.contents;
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
    // Persisted tabs are restored as state-only stubs. The renderer remounts a
    // <webview> for each and re-registers the guest; contents stay null until then.
    // Dedupe by (sessionId, url): older sessions could accumulate identical tabs
    // before openOrFocus landed; drop earlier duplicates so the tab bar stays clean.
    const seen = new Set<string>();
    const dedupedTabs = [...(persisted?.tabs ?? [])]
      .reverse()
      .filter((saved) => {
        const key = `${saved.sessionId} ${saved.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .reverse();
    for (const saved of dedupedTabs) {
      const state: BrowserTab = {
        ...saved,
        canGoBack: false,
        canGoForward: false,
        isLoading: true,
      };
      this.tabs.set(state.id, { state, contents: null });
    }
    // Drop active-tab pointers that no longer resolve after dedupe.
    for (const [sessionId, tabId] of this.activeTabBySession) {
      if (!this.tabs.has(tabId)) this.activeTabBySession.delete(sessionId);
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

function isAnnotationViewportEventPayload(value: unknown): value is {
  comment?: string;
  markerId: string;
  type: "delete" | "open" | "save";
} {
  if (!value || typeof value !== "object") return false;
  const payload = value as { comment?: unknown; markerId?: unknown; type?: unknown };
  return (
    typeof payload.markerId === "string" &&
    (payload.type === "delete" || payload.type === "open" || payload.type === "save") &&
    (payload.comment === undefined || typeof payload.comment === "string")
  );
}

/** Pull the geometry fields an `open` event carries for the React editor anchor. */
function extractOpenPayload(
  value: unknown,
): BrowserAnnotationViewportBridgeOpenPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const p = value as Record<string, unknown>;
  const rectPage = p.rectPage;
  const rectViewport = p.rectViewport;
  if (!isRect(rectPage) || !isRect(rectViewport)) return undefined;
  const intent =
    p.intent === "fix" || p.intent === "change" || p.intent === "question" || p.intent === "approve"
      ? (p.intent as BrowserAnnotationIntent)
      : "change";
  return {
    comment: typeof p.comment === "string" ? p.comment : "",
    computedStyles:
      p.computedStyles && typeof p.computedStyles === "object"
        ? (p.computedStyles as BrowserGrabComputedStyles)
        : ({} as BrowserGrabComputedStyles),
    intent,
    isFixed: Boolean(p.isFixed),
    rectPage,
    rectViewport,
    tagName: typeof p.tagName === "string" ? p.tagName : "",
  };
}

function isRect(value: unknown): value is BrowserRect {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number"
  );
}

async function contentsDownload(url: string, path: string, partition: string) {
  const response = await session.fromPartition(partition).fetch(url);
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}
