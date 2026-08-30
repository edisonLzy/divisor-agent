import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, dialog, nativeImage, session, shell, webContents, type WebContents } from "electron";

import type {
  BrowserGetProperty,
  BrowserNavigationAction,
  BrowserProfile,
  BrowserRect,
  BrowserState,
  BrowserTab,
  DetectedChromiumProfile,
} from "../common/types";
import { detectChromiumProfiles, importChromiumCookies } from "./cookie-import";
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

  constructor(
    private getWindow: () => Electron.BrowserWindow | null,
    private onStateChanged: (sessionId: string, state: BrowserState) => void,
    private annotationPreloadPath?: string,
  ) {
    this.load();
  }

  /**
   * Each Browser Artifact owns one page. The renderer uses this to bootstrap
   * that page without changing an existing page's URL or selected profile.
   */
  ensurePage(sessionId: string, url?: string, profileId?: string): BrowserTab {
    const existing = this.getSessionPage(sessionId);
    if (existing) return { ...existing.state };
    return this.createPage(sessionId, url, profileId ?? "default");
  }

  /**
   * Navigate the session's only page. Opening another URL replaces the current
   * page instead of creating another destination inside the Browser Artifact.
   */
  openPage(sessionId: string, url: string, profileId?: string): BrowserTab {
    const existing = this.getSessionPage(sessionId);
    if (!existing) return this.createPage(sessionId, url, profileId ?? "default");

    const profile = this.requireProfile(profileId ?? existing.state.profileId);
    if (existing.state.profileId !== profile.id) this.detachGuest(existing);
    existing.state = {
      ...existing.state,
      canGoBack: false,
      canGoForward: false,
      isLoading: true,
      profileId: profile.id,
      url: normalizeBrowserUrl(url),
    };
    this.activeTabBySession.set(sessionId, existing.state.id);
    this.snapshotService.clear(existing.state.id);
    this.persist();
    this.emit(sessionId);
    return { ...existing.state };
  }

  private createPage(sessionId: string, url?: string, profileId = "default"): BrowserTab {
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
      title: "New Page",
      url: normalizedUrl,
    };
    this.tabs.set(id, { state, contents: null });
    this.activeTabBySession.set(sessionId, id);
    // The renderer mounts a <webview> for this page and calls registerGuest with
    // its webContentsId; loading happens on the renderer side via webview.src.
    this.persist();
    this.emit(sessionId);
    return { ...state };
  }

  getState(sessionId: string): BrowserState {
    const page = this.getSessionPage(sessionId);
    return {
      activeTabId: page?.state.id ?? null,
      profiles: [...this.profiles.values()].map((profile) => ({ ...profile })),
      tabs: page ? [{ ...page.state }] : [],
    };
  }

  async navigate(sessionId: string, tabId: string, action: BrowserNavigationAction, url?: string) {
    const tab = this.requireOwnedTab(sessionId, tabId);
    const contents = tab.contents;
    if (!contents) {
      // Navigation is driven by the renderer's <webview>; main only tracks the
      // intended URL so state stays correct until the guest registers.
      if (action === "goto") {
        this.updateNavigationState(tab.state.id, {
          canGoBack: false,
          canGoForward: false,
          isLoading: true,
          url: normalizeBrowserUrl(url),
        });
      }
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
    if (!contents || contents.isDestroyed()) {
      console.warn(`[anno-debug] registerGuest fromId failed/destroyed id=${input.webContentsId}`);
      return;
    }
    console.warn(
      `[anno-debug] registerGuest ok pageId=${input.browserPageId} wcId=${input.webContentsId}`,
    );
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
      throw new Error("Move the browser page away from this profile before deleting");
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

  async openInSystemBrowser(sessionId: string, tabId?: string) {
    const page = this.resolveTab(sessionId, tabId);
    try {
      await shell.openExternal(page.state.url);
    } catch (error) {
      throw new BrowserOperationError(
        "browser_navigation_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
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
    const onWindowOpen = ({ url }: { url: string }) => {
      // A target=_blank page must not recreate the removed tab strip. Navigate
      // the Artifact's one page instead; opening an external browser is an
      // explicit action in the address toolbar.
      try {
        this.openPage(state.sessionId, url, state.profileId);
      } catch {
        // Invalid popup URLs remain blocked.
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

    // Stash disposers on the contents so detachGuest can remove them when the
    // guest is recreated or the page is replaced.
    (contents as unknown as { __divisorGuestListeners?: unknown }).__divisorGuestListeners = {
      onDidStartNavigation,
      onDidStartLoading,
      onDidStopLoading,
      onPageTitle,
      onDidNavigate,
      onDidNavigateInPage,
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
      delete (contents as unknown as { __divisorGuestListeners?: unknown }).__divisorGuestListeners;
    }
    tab.contents = null;
  }

  private configureSession(profile: BrowserProfile) {
    const browserSession = session.fromPartition(profile.partition);
    if (this.annotationPreloadPath) {
      browserSession.registerPreloadScript({
        filePath: this.annotationPreloadPath,
        id: "divisor-annotation-bridge",
        type: "frame",
      });
    }
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

  private resolveTab(sessionId: string, tabId?: string) {
    const resolvedId = tabId ?? this.activeTabBySession.get(sessionId);
    if (!resolvedId)
      throw new BrowserOperationError("browser_page_closed", "No browser page is open");
    return this.requireOwnedTab(sessionId, resolvedId);
  }

  private getSessionPage(sessionId: string): ManagedTab | undefined {
    const activeId = this.activeTabBySession.get(sessionId);
    const active = activeId ? this.tabs.get(activeId) : undefined;
    if (active?.state.sessionId === sessionId) return active;
    return [...this.tabs.values()].find((tab) => tab.state.sessionId === sessionId);
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
    // Persisted pages are restored as state-only stubs. The renderer remounts
    // its one <webview> and re-registers the guest; contents stay null until then.
    const preferredPageId = persisted?.activeTabBySession ?? {};
    const savedPages = new Map<string, PersistedState["tabs"][number]>();
    for (const saved of persisted?.tabs ?? []) {
      const current = savedPages.get(saved.sessionId);
      const preferredId = preferredPageId[saved.sessionId];
      if (!current || saved.id === preferredId || current.id !== preferredId) {
        savedPages.set(saved.sessionId, saved);
      }
    }
    // Older persisted state can contain several tabs for one session. Keep the
    // previously active page when possible (otherwise the newest saved one).
    for (const saved of savedPages.values()) {
      const state: BrowserTab = {
        ...saved,
        canGoBack: false,
        canGoForward: false,
        isLoading: true,
        profileId: this.profiles.has(saved.profileId) ? saved.profileId : DEFAULT_PROFILE.id,
      };
      this.tabs.set(state.id, { state, contents: null });
      this.activeTabBySession.set(state.sessionId, state.id);
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
        tabs: [...new Set([...this.tabs.values()].map((tab) => tab.state.sessionId))]
          .flatMap((sessionId) => this.getSessionPage(sessionId)?.state ?? [])
          .map((state) => ({
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

async function contentsDownload(url: string, path: string, partition: string) {
  const response = await session.fromPartition(partition).fetch(url);
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}
