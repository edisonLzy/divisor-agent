import type {
  AgentRuntimeIPC,
  AllowedMainExposeEvents,
  AllowedRenderInvokeEvents,
} from "@shared/events-ipc";
import { createContext, useContext } from "react";

// ── Typed ElectronAPI global (exposed by preload via contextBridge) ───────────

/**
 * Reuse the shared IPC method signatures so renderer and preload stay aligned.
 */
type InvokeArgs<C extends keyof AgentRuntimeIPC> = Parameters<AgentRuntimeIPC[C]>;

declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform;
      /**
       * Type-safe IPC invoke.
       * The channel name determines the params type and return type automatically.
       */
      invoke: <C extends AllowedRenderInvokeEvents>(
        channel: C,
        ...args: InvokeArgs<C>
      ) => Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>>;

      /**
       * Subscribe to a push event from the main process.
       * Returns an unsubscribe function.
       */
      on: <E extends keyof AllowedMainExposeEvents>(
        event: E,
        callback: (payload: AllowedMainExposeEvents[E]) => void,
      ) => () => void;
    };
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

type ElectronIPCContextValues = {
  invoke: Window["electronAPI"]["invoke"];
  on: Window["electronAPI"]["on"];
};

const ElectronIPCContext = createContext<ElectronIPCContextValues | null>(null);

export function useElectronIPC() {
  const ctx = useContext(ElectronIPCContext);
  if (!ctx) {
    throw new Error("useElectronIPC must be used within an ElectronIPCProvider");
  }
  return ctx;
}

export function ElectronIPCProvider({ children }: { children: React.ReactNode }) {
  const contextValue: ElectronIPCContextValues = {
    invoke: window.electronAPI.invoke,
    on: window.electronAPI.on,
  };

  return <ElectronIPCContext.Provider value={contextValue}>{children}</ElectronIPCContext.Provider>;
}
