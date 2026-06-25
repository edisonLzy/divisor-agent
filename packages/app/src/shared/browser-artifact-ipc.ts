export interface BrowserArtifactContent {
  title?: string;
  url: string;
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
}

export interface BrowserStateChangedEvent extends BrowserState {
  artifactId: string;
  sessionId: string;
  type: "browser_state_changed";
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
}
