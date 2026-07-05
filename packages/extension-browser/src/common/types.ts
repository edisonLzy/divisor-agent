export const BROWSER_EXTENSION = { id: "browser", name: "Browser" } as const;
export const BROWSER_ARTIFACT_ID = "browser";
export const BROWSER_ARTIFACT_TYPE = "browser.artifact";

export interface BrowserRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface BrowserTab {
  canGoBack: boolean;
  canGoForward: boolean;
  id: string;
  isLoading: boolean;
  profileId: string;
  sessionId: string;
  title: string;
  url: string;
}

export interface BrowserProfile {
  id: string;
  label: string;
  partition: string;
}

export interface BrowserState {
  activeTabId: string | null;
  profiles: BrowserProfile[];
  tabs: BrowserTab[];
}

export interface DetectedChromiumProfile {
  browser: string;
  cookiePath: string;
  id: string;
  label: string;
  localStatePath: string;
}

export interface BrowserElementPayload {
  accessibility: { name: string; role: string };
  ancestorPath: string[];
  computedStyles: Record<string, string>;
  fullPath: string;
  html: string;
  nearbyText: string[];
  rect: BrowserRect;
  screenshotPath?: string;
  selector: string;
  tagName: string;
  text: string;
  title: string;
  url: string;
}

export interface BrowserElementSelection {
  payload: BrowserElementPayload;
  screenshotDataUrl: string;
}

export type BrowserGetProperty = "box" | "html" | "name" | "role" | "state" | "text" | "value";
export type BrowserNavigationAction = "back" | "forward" | "goto" | "reload";

export interface BrowserInvokeEvents {
  createTab(input: { profileId?: string; sessionId: string; url?: string }): BrowserTab;
  closeTab(input: { sessionId: string; tabId: string }): void;
  setActiveTab(input: { sessionId: string; tabId: string }): void;
  getState(sessionId: string): BrowserState;
  navigate(input: {
    action: BrowserNavigationAction;
    sessionId: string;
    tabId: string;
    url?: string;
  }): Promise<void>;
  setSurface(input: {
    rect?: BrowserRect;
    sessionId: string;
    tabId?: string;
    visible: boolean;
  }): void;
  createProfile(label: string): BrowserProfile;
  renameProfile(input: { id: string; label: string }): BrowserProfile;
  deleteProfile(id: string): void;
  setTabProfile(input: { profileId: string; sessionId: string; tabId: string }): BrowserTab;
  detectChromiumProfiles(): DetectedChromiumProfile[];
  importChromiumCookies(input: {
    profileId: string;
    sourceId: string;
  }): Promise<{ imported: number }>;
  startElementSelection(input: {
    sessionId: string;
    tabId: string;
  }): Promise<BrowserElementSelection>;
  cancelElementSelection(input: { sessionId: string; tabId: string }): Promise<void>;
}

export interface BrowserExposeEvents {
  stateChanged(sessionId: string, state: BrowserState): void;
}
