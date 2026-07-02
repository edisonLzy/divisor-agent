import type { WebContents } from "electron";

/**
 * Resolves when the page is "done loading". Polls `webContents.isLoading()` since
 * CDP's `Page.loadEventFired` event may have already fired before we attached.
 *
 * Returns true if loading completed within `timeoutMs`, false otherwise.
 */
export async function waitForLoad(webContents: WebContents, timeoutMs = 5000): Promise<boolean> {
  if (webContents.isDestroyed()) return false;
  if (!webContents.isLoadingMainFrame() && !webContents.isLoading()) return true;
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (webContents.isDestroyed()) {
        resolve(false);
        return;
      }
      if (!webContents.isLoadingMainFrame() && !webContents.isLoading()) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}