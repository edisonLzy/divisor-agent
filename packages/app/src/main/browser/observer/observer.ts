import type { Observation, ObservationRefEntry } from "@shared/browser-artifact-ipc";

import type { CDPClient } from "../cdp/cdp-client.js";
import { captureJpegScreenshot } from "../cdp/screenshot.js";
import type { Tab } from "../tab.js";

/**
 * Produces an `Observation` snapshot of the current page: a JPEG screenshot,
 * a textual accessibility-tree rendering, and a `refMap` mapping short
 * `e0`-style references to DOM backend node IDs.
 *
 * For Phase A we only emit the screenshot + URL + title. The A11y tree
 * compression lands in Phase B.
 */
export class BrowserObserver {
  async refresh(tab: Tab): Promise<Observation> {
    const cdp = tab.cdp;
    const [screenshotDataUrl] = await Promise.all([captureJpegScreenshot(cdp, 70)]);
    const url = tab.url();
    const title = tab.title();

    // Phase B will populate a11yText + refMap by walking the AX tree.
    const a11yText = "";
    const refMap: Record<string, ObservationRefEntry> = {};

    return {
      a11yText,
      capturedAt: Date.now(),
      refMap,
      screenshotDataUrl,
      title,
      url,
    };
  }
}