import { createContext, useContext } from 'react';
import type { IpcInvokeMap, IpcEventMap } from '../../shared/ipc-types.js';

// ── Typed ElectronAPI global (exposed by preload via contextBridge) ───────────

/**
 * Helper: if Params is void the channel takes no extra args;
 * otherwise it takes exactly one argument of type Params.
 */
type InvokeArgs<C extends keyof IpcInvokeMap> =
  IpcInvokeMap[C]['params'] extends void ? [] : [IpcInvokeMap[C]['params']];

declare global {
  interface Window {
    electronAPI: {
      /**
       * Type-safe IPC invoke.
       * The channel name determines the params type and return type automatically.
       */
      invoke: <C extends keyof IpcInvokeMap>(
        channel: C,
        ...args: InvokeArgs<C>
      ) => Promise<IpcInvokeMap[C]['return']>;

      /**
       * Subscribe to a push event from the main process.
       * Returns an unsubscribe function.
       */
      on: <E extends keyof IpcEventMap>(
        event: E,
        callback: (payload: IpcEventMap[E]) => void,
      ) => () => void;
    };
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

type ElectronIPCContextValues = {
  invoke: Window['electronAPI']['invoke'];
  on: Window['electronAPI']['on'];
};

const ElectronIPCContext = createContext<ElectronIPCContextValues | null>(null);

export function useElectronIPC() {
  const ctx = useContext(ElectronIPCContext);
  if (!ctx) {
    throw new Error('useElectronIPC must be used within an ElectronIPCProvider');
  }
  return ctx;
}

export function ElectronIPCProvider({ children }: { children: React.ReactNode }) {
  const contextValue: ElectronIPCContextValues = {
    invoke: window.electronAPI.invoke,
    on: window.electronAPI.on,
  };

  return (
    <ElectronIPCContext.Provider value={contextValue}>
      {children}
    </ElectronIPCContext.Provider>
  );
}