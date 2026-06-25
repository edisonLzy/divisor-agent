// ── Existing types (preserved) ───────────────────────────────────────────────

export interface BrowserArtifactContent {
  title?: string;
  url: string;
  /** Multi-tab state (Phase C). */
  tabs?: TabInfo[];
  activeTabId?: string;
  /** Control mode state machine (Phase B+). */
  controlMode?: ControlMode;
}

export interface BrowserArtifactBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface BrowserAnnotationTarget {
  kind: string;
  label: string;
  rect: BrowserArtifactBounds;
  selector?: string;
  text?: string;
}

export interface BrowserCaptureResult {
  dataUrl: string;
  targets: BrowserAnnotationTarget[];
}

export interface BrowserState {
  canGoBack: boolean;
  canGoForward: boolean;
  status: "blocked" | "error" | "loading" | "ready";
  title: string;
  url: string;
  /** Control mode (Phase B+). */
  mode?: ControlMode;
}

export interface BrowserStateChangedEvent extends BrowserState {
  artifactId: string;
  sessionId: string;
  type: "browser_state_changed";
}

// ── New types (Phase A+) ────────────────────────────────────────────────────

export type ControlMode = "agent" | "user" | "paused";

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

export interface ObservationRefEntry {
  backendNodeId: number;
  role: string;
  name: string;
}

export interface Observation {
  refMap: Record<string, ObservationRefEntry>;
  a11yText: string;
  screenshotDataUrl: string;
  url: string;
  title: string;
  capturedAt: number;
}

export type ToolAction =
  | { kind: "goto"; url: string }
  | { kind: "observe"; selector?: string; maxRefs?: number }
  | { kind: "click"; ref: string }
  | { kind: "type"; ref: string; text: string; submit?: boolean }
  | { kind: "press"; key: string; modifiers?: string[] }
  | { kind: "scroll"; dy: number; ref?: string }
  | { kind: "back" }
  | { kind: "forward" }
  | { kind: "wait"; text?: string; selector?: string; timeoutMs?: number }
  | { kind: "extract"; instruction: string };

export interface BrowserTabChangedEvent {
  type: "browser_tab_changed";
  sessionId: string;
  artifactId: string;
  tabs: TabInfo[];
  activeTabId: string;
}

export interface BrowserScreenshotUpdatedEvent {
  type: "browser_screenshot_updated";
  sessionId: string;
  artifactId: string;
  tabId: string;
  screenshotDataUrl: string;
}

export interface BrowserArtifactIPC {
  browserCaptureForAnnotation: (
    sessionId: string,
    artifactId: string,
  ) => Promise<BrowserCaptureResult | { error: string }>;
  browserCreate: (
    sessionId: string,
    artifactId: string,
    content: BrowserArtifactContent,
  ) => Promise<BrowserState | { error: string }>;
  browserDestroy: (sessionId: string, artifactId: string) => Promise<void>;
  browserGoBack: (
    sessionId: string,
    artifactId: string,
  ) => Promise<BrowserState | { error: string }>;
  browserGoForward: (
    sessionId: string,
    artifactId: string,
  ) => Promise<BrowserState | { error: string }>;
  browserNavigate: (
    sessionId: string,
    artifactId: string,
    url: string,
  ) => Promise<BrowserState | { error: string }>;
  browserReload: (
    sessionId: string,
    artifactId: string,
  ) => Promise<BrowserState | { error: string }>;
  browserSetBounds: (
    sessionId: string,
    artifactId: string,
    bounds: BrowserArtifactBounds,
  ) => Promise<void>;
  browserSetVisible: (sessionId: string, artifactId: string, visible: boolean) => Promise<void>;

  // ── New (Phase A+) ──────────────────────────────────────────────────────
  browserSetMode: (
    sessionId: string,
    artifactId: string,
    mode: ControlMode,
  ) => Promise<void>;
  browserObserve: (
    sessionId: string,
    artifactId: string,
    opts?: { selector?: string; maxRefs?: number },
  ) => Promise<Observation | { error: string }>;
  browserDispatch: (
    sessionId: string,
    artifactId: string,
    action: ToolAction,
  ) => Promise<{ state: BrowserState; observation: Observation } | { error: string }>;
  browserOpenTab: (
    sessionId: string,
    artifactId: string,
    url: string,
  ) => Promise<TabInfo | { error: string }>;
  browserSwitchTab: (sessionId: string, artifactId: string, tabId: string) => Promise<void>;
  browserCloseTab: (sessionId: string, artifactId: string, tabId?: string) => Promise<void>;
  browserListTabs: (sessionId: string, artifactId: string) => Promise<TabInfo[]>;

  // ── Phase A: artifact → sessionId registry (renderer → main) ───────────
  browserRegisterArtifact: (artifactId: string, sessionId: string) => Promise<void>;
  browserUnregisterArtifact: (artifactId: string) => Promise<void>;
}
