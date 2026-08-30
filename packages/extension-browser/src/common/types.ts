export const BROWSER_EXTENSION = { id: "browser", name: "Browser" } as const;
export const BROWSER_ARTIFACT_ID = "browser";
export const BROWSER_ARTIFACT_TYPE = "browser.artifact";

// ---------------------------------------------------------------------------
// Basic geometry and state types (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reading annotations
// ---------------------------------------------------------------------------

/** A text range anchored relative to the page's body. Compatible with NoteBeam's range API. */
export interface BrowserTextRange {
  end: string;
  endOffset: number;
  start: string;
  startOffset: number;
}

export interface BrowserReadingTag {
  color: string;
  displayLabel?: string | null;
  group: "english" | "general";
  id: string;
  name: string;
}

export interface BrowserReadingNote {
  content: string;
  createdAt: string;
  id: string;
  updatedAt: string;
}

export interface BrowserTextSelection {
  page: { sanitizedUrl: string; title: string };
  range: BrowserTextRange;
  rectViewport: BrowserRect;
  sentence: string | null;
  text: string;
}

/**
 * A learning-oriented page annotation. This deliberately mirrors NoteBeam's
 * Highlight shape, while using ISO timestamps throughout the Electron app.
 */
export interface BrowserReadingAnnotation {
  createdAt: string;
  id: string;
  note: BrowserReadingNote;
  range: BrowserTextRange;
  sentence: string | null;
  tag: BrowserReadingTag;
  text: string;
  updatedAt: string;
  url: string;
}

export const DEFAULT_READING_TAGS: readonly BrowserReadingTag[] = [
  {
    color: "#4CAF50",
    displayLabel: "新词",
    group: "english",
    id: "vocabulary",
    name: "Vocabulary",
  },
  {
    color: "#FFEB3B",
    displayLabel: "好句",
    group: "english",
    id: "sentence",
    name: "Sentence",
  },
  {
    color: "#F44336",
    displayLabel: "重点",
    group: "general",
    id: "important",
    name: "Important",
  },
  {
    color: "#2196F3",
    displayLabel: "灵感",
    group: "general",
    id: "idea",
    name: "Idea",
  },
  {
    color: "#FF9800",
    displayLabel: "问题",
    group: "general",
    id: "question",
    name: "Question",
  },
];

// ---------------------------------------------------------------------------
// IPC types
// ---------------------------------------------------------------------------

export type BrowserGetProperty = "box" | "html" | "name" | "role" | "state" | "text" | "value";
export type BrowserNavigationAction = "back" | "forward" | "goto" | "reload";

export interface BrowserInvokeEvents {
  ensurePage(input: { profileId?: string; sessionId: string; url?: string }): BrowserTab;
  openPage(input: { profileId?: string; sessionId: string; url: string }): BrowserTab;
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
  /**
   * Register a renderer-owned `<webview>` guest with the main process.
   *
   * Why: after migrating from WebContentsView to `<webview>`, the guest page
   * is created by the renderer. Main still needs the guest's webContents to
   * attach navigation policy, CDP, the annotation console bridge, etc. The
   * renderer sends the guest's webContentsId (from `webview.getWebContentsId()`)
   * here; main resolves it via `webContents.fromId()` and adopts it.
   */
  registerGuest(input: {
    browserPageId: string;
    sessionId: string;
    profileId: string;
    webContentsId: number;
  }): void;
  unregisterGuest(input: { browserPageId: string }): void;
  openInSystemBrowser(input: { sessionId: string; tabId?: string }): Promise<void>;
  createProfile(label: string): BrowserProfile;
  renameProfile(input: { id: string; label: string }): BrowserProfile;
  deleteProfile(id: string): void;
  setTabProfile(input: { profileId: string; sessionId: string; tabId: string }): BrowserTab;
  detectChromiumProfiles(): DetectedChromiumProfile[];
  importChromiumCookies(input: {
    profileId: string;
    sourceId: string;
  }): Promise<{ imported: number; total: number; skipped: number; domains: string[] }>;
  createReadingAnnotation(input: BrowserReadingAnnotation): BrowserReadingAnnotation;
  deleteReadingAnnotation(id: string): void;
  listReadingAnnotations(input: { url: string }): BrowserReadingAnnotation[];
  updateReadingAnnotation(input: {
    id: string;
    note?: Partial<BrowserReadingNote>;
    tag?: BrowserReadingTag;
  }): BrowserReadingAnnotation;
}

export interface BrowserExposeEvents {
  stateChanged(sessionId: string, state: BrowserState): void;
}
