import type { Observation } from "@shared/browser-artifact-ipc";

import { compressAXTree, formatA11yForLLM, type CompressedA11y } from "../cdp/a11y.js";
import { hydrateRefMap } from "../cdp/ref-map.js";
import { captureJpegScreenshot } from "../cdp/screenshot.js";
import type { Tab } from "../tab.js";

/**
 * Produces an `Observation` snapshot: a JPEG screenshot, a textual
 * accessibility-tree rendering, and a `refMap` mapping short `e0`-style
 * references to DOM backend node IDs. The LLM uses these refs to issue
 * click / type / extract commands.
 */
export class BrowserObserver {
  async refresh(tab: Tab, opts: { maxRefs?: number; selector?: string } = {}): Promise<Observation> {
    const cdp = tab.cdp;
    const [screenshot, axTree] = await Promise.all([
      captureJpegScreenshot(cdp, 70),
      cdp.getFullAXTree(),
    ]);

    const compressed: CompressedA11y = compressAXTree(axTree.nodes, opts.maxRefs ?? 32);

    // Refresh the tab's refMap so subsequent Operator.click / type calls can
    // resolve `e0` references.
    tab.refMap = hydrateRefMap(compressed.refMap);

    return {
      a11yText: formatA11yForLLM(compressed),
      capturedAt: Date.now(),
      refMap: compressed.refMap,
      screenshotDataUrl: screenshot,
      title: tab.title(),
      url: tab.url(),
    };
  }
}