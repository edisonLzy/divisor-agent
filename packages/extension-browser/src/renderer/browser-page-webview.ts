import { BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from "../common/browser-guest-web-preferences";

// Minimal structural type for the subset of the <webview> API we use. We avoid
// depending on Electron's global `Electron.WebviewTag` so this source-only
// package stays independently compilable; the real element is created via
// document.createElement('webview') at runtime.
export interface BrowserPageWebview extends HTMLElement {
  src: string;
  getWebContentsId(): number;
  send(channel: string, ...args: unknown[]): void;
  addEventListener(
    type: "dom-ready",
    listener: (event: { target: BrowserPageWebview }) => void,
  ): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

// ---------------------------------------------------------------------------
// <webview> element factory
//
// Why createElement rather than JSX: <webview> is a non-standard Electron tag
// without first-class React 19 / TS JSX typings, and its lifecycle (guest
// recreation on reparent) is easier to manage imperatively. This mirrors
// ORCA's browser-page-webview.ts approach.
//
// The host renderer owns the <webview> (it lives in the renderer DOM, so React
// overlays CAN paint above it - the whole reason for the WebContentsView ->
// <webview> migration). Main adopts the guest via registerGuest once
// dom-ready fires.
// ---------------------------------------------------------------------------

export interface EnsureBrowserPageWebviewInput {
  browserPageId: string;
  inputLocked: boolean;
  partition: string;
  url: string;
}

export interface EnsureBrowserPageWebviewResult {
  created: boolean;
  webview: BrowserPageWebview;
}

const REGISTRY = new Map<string, BrowserPageWebview>();

export function getBrowserPageWebview(browserPageId: string): BrowserPageWebview | null {
  return REGISTRY.get(browserPageId) ?? null;
}

export function removeBrowserPageWebview(browserPageId: string): void {
  const webview = REGISTRY.get(browserPageId);
  if (webview && webview.parentElement) {
    webview.parentElement.removeChild(webview);
  }
  REGISTRY.delete(browserPageId);
}

/**
 * Ensure a <webview> for the given browser page is mounted in `container`.
 * Reuses an existing element when the page id, partition, and parent match;
 * otherwise recreates it (reparenting a <webview> recreates the guest
 * document, so we rebuild deliberately and re-register the new guest).
 */
export function ensureBrowserPageWebview(
  container: HTMLElement,
  input: EnsureBrowserPageWebviewInput,
): EnsureBrowserPageWebviewResult | null {
  const existing = REGISTRY.get(input.browserPageId);
  const stale =
    !existing ||
    existing.parentElement !== container ||
    existing.getAttribute("partition") !== input.partition;

  if (existing && !stale) {
    existing.style.pointerEvents = input.inputLocked ? "none" : "auto";
    return { created: false, webview: existing };
  }

  if (existing) {
    if (existing.parentElement) existing.parentElement.removeChild(existing);
    REGISTRY.delete(input.browserPageId);
  }

  const webview = document.createElement("webview") as BrowserPageWebview;
  webview.setAttribute("partition", input.partition);
  webview.setAttribute("allowpopups", "");
  webview.setAttribute("webpreferences", BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE);
  webview.style.display = "flex";
  webview.style.flex = "1";
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.style.pointerEvents = input.inputLocked ? "none" : "auto";
  webview.src = input.url;
  container.appendChild(webview);
  REGISTRY.set(input.browserPageId, webview);
  return { created: true, webview };
}
