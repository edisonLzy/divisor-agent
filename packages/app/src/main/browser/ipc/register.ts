import type { BrowserSessionManager } from "../browser-session-manager.js";

/**
 * Singleton holder for `BrowserSessionManager`. `bindAgentRuntimeIPC` constructs
 * the manager after `BrowserManager` and writes it here; tools import
 * `browserSessionManager` directly. This avoids round-tripping the manager
 * through extension contexts at the cost of a module-level global.
 */
let manager: BrowserSessionManager | null = null;

export function setBrowserSessionManager(m: BrowserSessionManager): void {
  manager = m;
}

export function getBrowserSessionManager(): BrowserSessionManager {
  if (!manager) {
    throw new Error(
      "BrowserSessionManager not initialised; bindAgentRuntimeIPC must run before any browser tool executes.",
    );
  }
  return manager;
}