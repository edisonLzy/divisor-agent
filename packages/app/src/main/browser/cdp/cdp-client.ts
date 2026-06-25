import type { WebContents } from "electron";

/**
 * Type-safe wrapper over `webContents.debugger.sendCommand` (Chrome DevTools Protocol).
 *
 * Each Tab attaches a CDPClient and enables `Page`, `DOM`, `Accessibility`, `Runtime`,
 * `Network`, `Input` domains in its constructor. The client also subscribes to CDP
 * events via `webContents.debugger.on("message", ...)` and routes them by method name.
 */
export class CDPClient {
  private listeners = new Map<string, Set<(payload: any) => void>>();
  private messageHandler?: (_event: unknown, method: string, params: unknown) => void;

  constructor(
    private wc: WebContents,
    private protocolVersion = "1.3",
  ) {}

  async send<TRes = unknown>(method: string, params?: unknown): Promise<TRes> {
    return this.wc.debugger.sendCommand(method, params) as Promise<TRes>;
  }

  on(method: string, cb: (payload: any) => void): () => void {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, new Set());
    }
    this.listeners.get(method)!.add(cb);
    return () => {
      this.listeners.get(method)?.delete(cb);
    };
  }

  private routeMessage(method: string, params: unknown) {
    const set = this.listeners.get(method);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(params);
      } catch (err) {
        // Don't let listener bugs break the message loop.
        console.error(`[CDPClient] listener for ${method} threw:`, err);
      }
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async attach(): Promise<void> {
    if (this.wc.isDestroyed()) return;
    try {
      this.wc.debugger.attach(this.protocolVersion);
    } catch (err) {
      // Already attached — ignore.
      if (!(err instanceof Error) || !err.message.includes("Already attached")) {
        throw err;
      }
    }
    this.messageHandler = (_event, method, params) => this.routeMessage(method, params);
    this.wc.debugger.on("message", this.messageHandler);
  }

  async detach(): Promise<void> {
    if (this.messageHandler) {
      this.wc.debugger.off("message", this.messageHandler);
      this.messageHandler = undefined;
    }
    if (this.wc.isDestroyed()) return;
    try {
      this.wc.debugger.detach();
    } catch {
      /* already detached */
    }
  }

  async enableDomains(): Promise<void> {
    await Promise.all([
      this.send("Page.enable"),
      this.send("DOM.enable"),
      this.send("Accessibility.enable"),
      this.send("Runtime.enable"),
      this.send("Network.enable"),
    ]);
  }

  // ── Page domain ─────────────────────────────────────────────────────────

  navigate(url: string) {
    return this.send<{ frameId: string }>("Page.navigate", { url });
  }

  reload(ignoreCache = false) {
    return this.send("Page.reload", { ignoreCache });
  }

  captureScreenshot(opts: { format?: "jpeg" | "png"; quality?: number; clip?: unknown }) {
    const format = opts.format ?? "jpeg";
    return this.send<{ data: string }>("Page.captureScreenshot", {
      format,
      quality: format === "jpeg" ? (opts.quality ?? 70) : undefined,
      captureBeyondViewport: false,
      clip: opts.clip,
    });
  }

  // ── DOM / Runtime domain ────────────────────────────────────────────────

  getDocument() {
    return this.send<{ root: { nodeId: number; backendNodeId: number } }>("DOM.getDocument", {
      depth: -1,
      pierce: true,
    });
  }

  resolveNode(backendNodeId: number, objectGroup = "browser-ext") {
    return this.send<{ object: { objectId: string } }>("DOM.resolveNode", {
      backendNodeId,
      objectGroup,
    });
  }

  evaluate<T = unknown>(expression: string, awaitPromise = false) {
    return this.send<{ result: { value: T; type?: string } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
      objectGroup: "browser-ext",
    });
  }

  callFunctionOn<T = unknown>(objectId: string, fn: string, args: unknown[] = []) {
    return this.send<{ result: { value: T } }>("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: fn,
      arguments: args,
      returnByValue: true,
    });
  }

  // ── Input domain (CDP, not webContents.sendInputEvent) ──────────────────

  dispatchMouseEvent(
    type: "mousePressed" | "mouseReleased" | "mouseMoved",
    x: number,
    y: number,
    button: "left" | "right" | "middle" = "left",
    clickCount = 1,
  ) {
    return this.send("Input.dispatchMouseEvent", { type, x, y, button, clickCount });
  }

  dispatchKeyEvent(
    type: "keyDown" | "keyUp" | "char",
    modifiers = 0,
    opts: { key?: string; code?: string; text?: string; windowsVirtualKeyCode?: number } = {},
  ) {
    return this.send("Input.dispatchKeyEvent", { type, modifiers, ...opts });
  }

  // ── Accessibility domain ────────────────────────────────────────────────

  getFullAXTree() {
    return this.send<{ nodes: AXNode[] }>("Accessibility.getFullAXTree");
  }

  // ── Network domain ──────────────────────────────────────────────────────

  setBlockedUrls(urls: string[]) {
    return this.send("Network.setBlockedURLs", { urls });
  }
}

// ── Minimal CDP AX node shape (only fields we use) ──────────────────────────

export interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  role?: { value: string };
  name?: { value: string };
  value?: { value: unknown };
  description?: { value: string };
  properties?: Array<{ name: string; value: { value: unknown } }>;
  childIds?: string[];
}