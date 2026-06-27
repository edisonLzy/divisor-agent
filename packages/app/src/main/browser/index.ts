import { BrowserWindow, WebContentsView } from "electron";
import Emittery from "emittery";

import type {
  BrowserAnnotationTarget,
  BrowserArtifactBounds,
  BrowserArtifactIPC,
  BrowserState,
  BrowserStateChangedEvent,
} from "../../shared/browser-artifact-ipc.js";
import type { AgentSessionScope } from "../../shared/events-ipc.js";
import { createTypedIpcMain } from "../helper.js";
import { AgentEventsBinder } from "../types.js";

type BrowserManagerEvents = {
  browser_state_changed: BrowserStateChangedEvent & {
    scope: AgentSessionScope;
  };
};

interface BrowserRecord {
  artifactId: string;
  bounds: BrowserArtifactBounds;
  sessionId: string;
  state: BrowserState;
  view: WebContentsView;
  visible: boolean;
}

const DEFAULT_STATE: BrowserState = {
  canGoBack: false,
  canGoForward: false,
  status: "loading",
  title: "Browser",
  url: "about:blank",
};

export class BrowserManager
  extends Emittery<BrowserManagerEvents>
  implements BrowserArtifactIPC, AgentEventsBinder
{
  private records = new Map<string, BrowserRecord>();
  private window!: BrowserWindow;

  constructor() {
    super();
  }

  // ── BrowserArtifactIPC implementation ────────────────────────────────────

  browserCreate: BrowserArtifactIPC["browserCreate"] = async (sessionId, artifactId, content) => {
    const key = getBrowserKey(sessionId, artifactId);
    const existing = this.records.get(key);
    if (existing) {
      await this.browserNavigate(sessionId, artifactId, content.url);
      return existing.state;
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    const record: BrowserRecord = {
      artifactId,
      bounds: { height: 0, width: 0, x: 0, y: 0 },
      sessionId,
      state: {
        ...DEFAULT_STATE,
        title: content.title ?? DEFAULT_STATE.title,
        url: content.url,
      },
      view,
      visible: false,
    };

    this.configureWebContents(record);
    this.records.set(key, record);
    this.window.contentView.addChildView(view);
    this.applyBounds(record);
    await this.loadUrl(record, content.url);
    return record.state;
  };

  browserDestroy: BrowserArtifactIPC["browserDestroy"] = async (sessionId, artifactId) => {
    const key = getBrowserKey(sessionId, artifactId);
    const record = this.records.get(key);
    if (!record) return;

    this.records.delete(key);
    this.window.contentView.removeChildView(record.view);
    record.view.webContents.close();
  };

  browserNavigate: BrowserArtifactIPC["browserNavigate"] = async (
    sessionId,
    artifactId,
    rawUrl,
  ) => {
    const record = this.requireRecord(sessionId, artifactId);
    await this.loadUrl(record, rawUrl);
    return record.state;
  };

  browserReload: BrowserArtifactIPC["browserReload"] = async (sessionId, artifactId) => {
    const record = this.requireRecord(sessionId, artifactId);
    record.view.webContents.reload();
    return this.updateState(record, { status: "loading" });
  };

  browserGoBack: BrowserArtifactIPC["browserGoBack"] = async (sessionId, artifactId) => {
    const record = this.requireRecord(sessionId, artifactId);
    if (record.view.webContents.canGoBack()) {
      record.view.webContents.goBack();
      return this.updateState(record, { status: "loading" });
    }
    return this.updateState(record);
  };

  browserGoForward: BrowserArtifactIPC["browserGoForward"] = async (sessionId, artifactId) => {
    const record = this.requireRecord(sessionId, artifactId);
    if (record.view.webContents.canGoForward()) {
      record.view.webContents.goForward();
      return this.updateState(record, { status: "loading" });
    }
    return this.updateState(record);
  };

  browserCaptureForAnnotation: BrowserArtifactIPC["browserCaptureForAnnotation"] = async (
    sessionId,
    artifactId,
  ) => {
    const record = this.requireRecord(sessionId, artifactId);
    const image = await record.view.webContents.capturePage();
    const targets = await record.view.webContents.executeJavaScript(
      `(${collectAnnotationTargets.toString()})()`,
      true,
    );
    return {
      dataUrl: image.toDataURL(),
      targets: Array.isArray(targets) ? targets : [],
    };
  };

  browserSetBounds: BrowserArtifactIPC["browserSetBounds"] = async (
    sessionId,
    artifactId,
    bounds,
  ) => {
    const record = this.requireRecord(sessionId, artifactId);
    record.bounds = sanitizeBounds(bounds);
    this.applyBounds(record);
  };

  browserSetVisible: BrowserArtifactIPC["browserSetVisible"] = async (
    sessionId,
    artifactId,
    visible,
  ) => {
    const record = this.requireRecord(sessionId, artifactId);
    record.visible = visible;
    this.applyBounds(record);
  };

  /**
   * Drop every browser view owned by `sessionId`. Called from AgentPool's
   * cross-module `destroySession` handler so all artifacts tied to a session
   * are torn down together with the runtime that owns it.
   */
  async destroySession(sessionId: string) {
    const records = Array.from(this.records.values()).filter(
      (record) => record.sessionId === sessionId,
    );
    await Promise.all(
      records.map((record) => this.browserDestroy(record.sessionId, record.artifactId)),
    );
  }

  /**
   * Tear down every active browser view and clear all event listeners.
   * Called on `app.on("quit", ...)` from `index.ts`.
   */
  destroyAll(): void {
    for (const record of Array.from(this.records.values())) {
      this.window.contentView.removeChildView(record.view);
      record.view.webContents.close();
    }
    this.records.clear();
    this.clearListeners();
  }

  /**
   * Wire this BrowserManager up to a BrowserWindow:
   *   - forwards every Emittery event (`browser_state_changed`) to the renderer
   *   - registers all `browser*` IPC handlers under the BrowserArtifactIPC contract
   *
   * Returns an unbind function that detaches the Emittery listener and removes
   * the IPC handlers.
   */
  bindEvents(browserWindow: BrowserWindow): () => void {
    this.window = browserWindow;

    const offBrowserAny = this.onAny(({ name, data }) => {
      if (browserWindow.isDestroyed() || typeof name !== "string") {
        return;
      }
      browserWindow.webContents.send(name, data);
    });

    const typedBrowserIPC = createTypedIpcMain<BrowserArtifactIPC>();
    typedBrowserIPC.handle("browserCreate", async (...args) => {
      try {
        return await this.browserCreate(...args);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    typedBrowserIPC.handle("browserDestroy", this.browserDestroy.bind(this));
    typedBrowserIPC.handle("browserSetBounds", async (...args) => {
      await this.browserSetBounds(...args);
    });
    typedBrowserIPC.handle("browserNavigate", async (...args) => {
      try {
        return await this.browserNavigate(...args);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    typedBrowserIPC.handle("browserGoBack", async (...args) => {
      try {
        return await this.browserGoBack(...args);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    typedBrowserIPC.handle("browserGoForward", async (...args) => {
      try {
        return await this.browserGoForward(...args);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    typedBrowserIPC.handle("browserReload", async (...args) => {
      try {
        return await this.browserReload(...args);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    typedBrowserIPC.handle("browserCaptureForAnnotation", async (...args) => {
      try {
        return await this.browserCaptureForAnnotation(...args);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    typedBrowserIPC.handle("browserSetVisible", async (...args) => {
      await this.browserSetVisible(...args);
    });

    return () => {
      offBrowserAny();
      typedBrowserIPC.removeAllListeners();
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private applyBounds(record: BrowserRecord) {
    const hasArea = record.bounds.width > 0 && record.bounds.height > 0;
    record.view.setBounds(
      record.visible && hasArea ? record.bounds : { height: 0, width: 0, x: 0, y: 0 },
    );
  }

  private configureWebContents(record: BrowserRecord) {
    const { webContents } = record.view;

    webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    webContents.on("did-start-loading", () => this.updateState(record, { status: "loading" }));
    webContents.on("did-stop-loading", () => {
      if (record.state.status === "loading") {
        this.updateState(record, { status: "ready" });
      }
    });
    webContents.on("page-title-updated", (_event, title) => this.updateState(record, { title }));
    webContents.on("did-navigate", (_event, url) =>
      this.updateState(record, { url, status: "ready" }),
    );
    webContents.on("did-navigate-in-page", (_event, url) => this.updateState(record, { url }));
    webContents.on(
      "did-fail-load",
      (_event, _errorCode, _errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame) return;
        this.updateState(record, {
          status: "error",
          url: validatedUrl || record.state.url,
        });
      },
    );
    webContents.on("will-navigate", (event, url) => {
      if (!isAllowedUrl(url)) {
        event.preventDefault();
        this.updateState(record, { status: "blocked", url });
      }
    });
  }

  private async loadUrl(record: BrowserRecord, rawUrl: string) {
    const url = normalizeUrl(rawUrl);
    if (!isAllowedUrl(url)) {
      return this.updateState(record, { status: "blocked", url });
    }

    this.updateState(record, { status: "loading", url });
    try {
      await record.view.webContents.loadURL(url);
    } catch {
      this.updateState(record, { status: "error", url });
    }
    return record.state;
  }

  private requireRecord(sessionId: string, artifactId: string) {
    const record = this.records.get(getBrowserKey(sessionId, artifactId));
    if (!record) {
      throw new Error(`Browser artifact not found: ${sessionId}/${artifactId}`);
    }
    return record;
  }

  private updateState(record: BrowserRecord, patch: Partial<BrowserState> = {}) {
    record.state = {
      ...record.state,
      ...patch,
      canGoBack: record.view.webContents.canGoBack(),
      canGoForward: record.view.webContents.canGoForward(),
      title: patch.title ?? (record.view.webContents.getTitle() || record.state.title),
      url: patch.url ?? (record.view.webContents.getURL() || record.state.url),
    };

    // Emit the new state through Emittery; `bindEvents` wires the onAny
    // listener to `webContents.send` so the renderer receives every
    // loading → ready / error / blocked transition, not just the snapshot
    // returned from each IPC call.
    this.emit("browser_state_changed", {
      type: "browser_state_changed",
      scope: "main",
      sessionId: record.sessionId,
      artifactId: record.artifactId,
      ...record.state,
    });

    return record.state;
  }
}

function getBrowserKey(sessionId: string, artifactId: string) {
  return `${sessionId}:${artifactId}`;
}

function sanitizeBounds(bounds: BrowserArtifactBounds): BrowserArtifactBounds {
  return {
    height: Math.max(0, Math.round(bounds.height)),
    width: Math.max(0, Math.round(bounds.width)),
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
  };
}

function normalizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "about:blank";
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("file:") || trimmed === "about:blank") {
    return trimmed;
  }
  if (trimmed.includes("localhost") || trimmed.includes("127.0.0.1")) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function isAllowedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return ["about:", "file:", "http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function collectAnnotationTargets(): BrowserAnnotationTarget[] {
  const candidates = Array.from(
    document.querySelectorAll(
      "button, a, input, textarea, select, [role=button], h1, h2, h3, nav, section, table, [data-testid]",
    ),
  );
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return candidates
    .map((element, index): BrowserAnnotationTarget | null => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return null;
      if (
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.left > viewportWidth ||
        rect.top > viewportHeight
      ) {
        return null;
      }

      const tagName = element.tagName.toLowerCase();
      const text = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
      return {
        kind: tagName,
        label: text || tagName,
        rect: {
          height: rect.height,
          width: rect.width,
          x: rect.left,
          y: rect.top,
        },
        selector: `[data-browser-target="${index}"]`,
        text,
      };
    })
    .filter((target): target is BrowserAnnotationTarget => target !== null)
    .slice(0, 24);
}
