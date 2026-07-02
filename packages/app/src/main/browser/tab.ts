import type { WebContents } from "electron";

import type { CDPClient } from "./cdp/cdp-client.js";
import { canTransition, type ControlMode, ControlModeError } from "./control-mode.js";
import type { ObservationRefEntry } from "@shared/browser-artifact-ipc";

/**
 * One browser tab. Phase A keeps a single Tab per BrowserSession (the existing
 * BrowserManager already owns that view). Phase C will add multi-tab.
 */
export class Tab {
  public readonly id: string;
  public controlMode: ControlMode = "agent";
  /** refMap from latest observation; updated by BrowserOperator. */
  public refMap = new Map<string, ObservationRefEntry>();

  constructor(
    public readonly webContents: WebContents,
    public readonly cdp: CDPClient,
    id?: string,
  ) {
    this.id = id ?? `t-${Math.random().toString(36).slice(2, 8)}`;
  }

  setMode(mode: ControlMode): void {
    if (this.controlMode === mode) return;
    if (!canTransition(this.controlMode, mode)) {
      throw new ControlModeError(
        `Cannot transition controlMode from "${this.controlMode}" to "${mode}"`,
      );
    }
    this.controlMode = mode;
  }

  url(): string {
    return this.webContents.isDestroyed() ? "" : this.webContents.getURL();
  }

  title(): string {
    return this.webContents.isDestroyed() ? "" : this.webContents.getTitle();
  }

  snapshotState(): { url: string; title: string } {
    return { title: this.title(), url: this.url() };
  }

  async dispose(): Promise<void> {
    await this.cdp.detach();
    if (!this.webContents.isDestroyed()) {
      this.webContents.close();
    }
  }
}