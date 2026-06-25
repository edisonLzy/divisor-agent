import type { Observation } from "@shared/browser-artifact-ipc";

/**
 * Per-tab cache of the most recent observation. Tools that need a stable ref
 * (click/type/extract) resolve their `ref` argument against the cached
 * refMap; if it's missing, the operator throws RefExpiredError.
 */
export class ObservationStore {
  private latest = new Map<string, Observation>();

  set(tabId: string, obs: Observation) {
    this.latest.set(tabId, obs);
  }

  get(tabId: string): Observation | undefined {
    return this.latest.get(tabId);
  }

  clear(tabId: string) {
    this.latest.delete(tabId);
  }
}