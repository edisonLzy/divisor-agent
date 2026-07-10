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
// Grab payload — expanded element context
// ---------------------------------------------------------------------------

/** Page-level metadata captured at selection time. */
export interface BrowserGrabPageContext {
  sanitizedUrl: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
  capturedAt: string;
}

/** Accessibility metadata for the selected element. */
export interface BrowserGrabAccessibility {
  role: string | null;
  accessibleName: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
}

/** Curated subset of computed styles — 16 properties. */
export interface BrowserGrabComputedStyles {
  display: string;
  position: string;
  width: string;
  height: string;
  margin: string;
  padding: string;
  color: string;
  backgroundColor: string;
  border: string;
  borderRadius: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  zIndex: string;
}

/** The selected element's extracted data. */
export interface BrowserGrabTarget {
  tagName: string;
  selector: string;
  elementPath?: string;
  fullPath?: string;
  cssClasses?: string;
  nearbyElements?: string[];
  selectedText?: string | null;
  isFixed?: boolean;
  reactComponents?: string | null;
  sourceFile?: string | null;
  textSnippet: string;
  htmlSnippet: string;
  attributes: Record<string, string>;
  accessibility: BrowserGrabAccessibility;
  rectViewport: BrowserRect;
  rectPage: BrowserRect;
  computedStyles: BrowserGrabComputedStyles;
}

/** Screenshot attachment — always PNG data URL. */
export interface BrowserGrabScreenshot {
  mimeType: "image/png";
  dataUrl: string;
  width: number;
  height: number;
}

/** The full payload extracted from a browser grab selection. */
export interface BrowserGrabPayload {
  page: BrowserGrabPageContext;
  target: BrowserGrabTarget;
  nearbyText: string[];
  ancestorPath: string[];
  screenshot: BrowserGrabScreenshot | null;
}

/** Persisted annotation payloads keep DOM context but drop transient screenshots. */
export interface BrowserAnnotationPayload extends Omit<BrowserGrabPayload, "screenshot"> {
  screenshot: null;
}

// ---------------------------------------------------------------------------
// Backward-compatible alias for the old BrowserElementPayload
// ---------------------------------------------------------------------------

/** @deprecated Use BrowserGrabPayload instead. */
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

// ---------------------------------------------------------------------------
// Grab selection result
// ---------------------------------------------------------------------------

export interface BrowserElementSelection {
  comment: string;
  kind: "selected" | "context-selected";
  payload: BrowserGrabPayload;
  screenshotDataUrl: string;
}

/** Why a grab operation was cancelled before the user selected an element. */
export type BrowserGrabCancelReason =
  | "user"
  | "tab-inactive"
  | "navigation"
  | "evicted"
  | "timeout";

/** Discriminated union for the result of a single grab operation. */
export type BrowserGrabResult =
  | { kind: "selected"; payload: BrowserGrabPayload }
  | { kind: "context-selected"; payload: BrowserGrabPayload }
  | { kind: "cancelled"; reason: BrowserGrabCancelReason }
  | { kind: "error"; reason: string };

// ---------------------------------------------------------------------------
// Annotation types
// ---------------------------------------------------------------------------

export type BrowserAnnotationIntent = "fix" | "change" | "question" | "approve";

export type BrowserAnnotationPriority = "blocking" | "important" | "suggestion";

export interface BrowserPageAnnotation {
  id: string;
  browserPageId: string;
  comment: string;
  intent: BrowserAnnotationIntent;
  priority: BrowserAnnotationPriority;
  createdAt: string;
  payload: BrowserAnnotationPayload;
}

// ---------------------------------------------------------------------------
// Payload budgets — enforced in both guest and main
// ---------------------------------------------------------------------------

export const GRAB_BUDGET = {
  textSnippetMaxLength: 200,
  nearbyTextEntryMaxLength: 200,
  nearbyTextMaxEntries: 10,
  htmlSnippetMaxLength: 4096,
  ancestorPathMaxEntries: 10,
  nearbyElementsMaxEntries: 6,
  nearbyElementMaxLength: 160,
  selectorMaxLength: 700,
  pathMaxLength: 900,
  cssClassesMaxLength: 500,
  selectedTextMaxLength: 500,
  sourceFileMaxLength: 500,
  reactComponentsMaxLength: 500,
  annotationCommentMaxLength: 2000,
  annotationsMaxPerPage: 20,
  /** Hard byte budget for screenshot PNG data URL before we omit the screenshot. */
  screenshotMaxBytes: 2 * 1024 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Attribute allowlist for safe preview
// ---------------------------------------------------------------------------

/** Only these attribute names are included in the payload by default. */
export const GRAB_SAFE_ATTRIBUTE_NAMES = new Set([
  "id",
  "class",
  "name",
  "type",
  "role",
  "href",
  "src",
  "alt",
  "title",
  "placeholder",
  "for",
  "action",
  "method",
]);

/**
 * Patterns in attribute values that indicate secrets — these values get
 * redacted. Why tighter patterns than broad words like 'code' or 'state':
 * those match normal CSS class names (e.g. 'source-code', 'stateful') and
 * would visibly degrade extraction quality on most real-world sites.
 */
export const GRAB_SECRET_PATTERNS = [
  "access_token",
  "auth_token",
  "api_key",
  "apikey",
  "client_secret",
  "oauth_state",
  "x-amz-",
  "session_id",
  "sessionid",
  "csrf",
  "secret",
  "password",
  "passwd",
];

/** Computed style properties to extract — matches BrowserGrabComputedStyles keys. */
export const GRAB_STYLE_PROPERTIES: readonly (keyof BrowserGrabComputedStyles)[] = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "color",
  "backgroundColor",
  "border",
  "borderRadius",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "zIndex",
];

// ---------------------------------------------------------------------------
// Viewport bridge types
// ---------------------------------------------------------------------------

export interface BrowserAnnotationViewportBridgeMarker {
  id: string;
  index: number;
  comment: string;
  computedStyles: BrowserGrabComputedStyles;
  intent: BrowserAnnotationIntent;
  tagName: string;
  rectPage: BrowserRect;
  rectViewport: BrowserRect;
  isFixed: boolean;
}

export type BrowserAnnotationViewportBridgeEventType = "delete" | "hover" | "open" | "save";

/**
 * Geometry carried on `open`/`hover` events so the host renderer can anchor its
 * React overlays (tooltip/editor) at the marker via @floating-ui. `anchorX/Y`
 * are the marker pin's position in guest-viewport coords; the host adds the
 * <webview> element's screen rect to get renderer-screen coords.
 */
export interface BrowserAnnotationViewportBridgeOpenPayload {
  anchorX: number;
  anchorY: number;
  comment: string;
  computedStyles: BrowserGrabComputedStyles;
  intent: BrowserAnnotationIntent;
  isFixed: boolean;
  rectPage: BrowserRect;
  rectViewport: BrowserRect;
  tagName: string;
}

export interface BrowserAnnotationViewportBridgeEvent {
  browserPageId: string;
  comment?: string;
  /** null on hover-leave; otherwise the marker id. */
  markerId: string | null;
  type: BrowserAnnotationViewportBridgeEventType;
  /** Present only on `open`/`hover` events (null markerId on hover-leave). */
  open?: BrowserAnnotationViewportBridgeOpenPayload;
}

// ---------------------------------------------------------------------------
// IPC types
// ---------------------------------------------------------------------------

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
  createProfile(label: string): BrowserProfile;
  renameProfile(input: { id: string; label: string }): BrowserProfile;
  deleteProfile(id: string): void;
  setTabProfile(input: { profileId: string; sessionId: string; tabId: string }): BrowserTab;
  detectChromiumProfiles(): DetectedChromiumProfile[];
  importChromiumCookies(input: {
    profileId: string;
    sourceId: string;
  }): Promise<{ imported: number; total: number; skipped: number; domains: string[] }>;
  startElementSelection(input: {
    sessionId: string;
    tabId: string;
  }): Promise<BrowserElementSelection>;
  cancelElementSelection(input: { sessionId: string; tabId: string }): Promise<void>;
  setAnnotationViewportBridge(input: {
    browserPageId: string;
    enabled: boolean;
    markers: BrowserAnnotationViewportBridgeMarker[];
    token: string;
  }): void;
}

export interface BrowserExposeEvents {
  annotationViewportEvent(event: BrowserAnnotationViewportBridgeEvent): void;
  stateChanged(sessionId: string, state: BrowserState): void;
}
