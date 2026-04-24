import { createContext, useContext } from 'react';
import type {
  AgentMessageChunkPayload,
  AgentMessageDonePayload,
  SessionRequestPermissionPayload,
  SessionForkedPayload,
} from '../../shared/ipc-types.js';

// ── ElectronAPI global type (exposed by preload) ──────────────────────────────

type AllowedChannel =
  | 'setModel'
  | 'cycleModel'
  | 'getAvailableModels'
  | 'sessionPrompt'
  | 'permissionApprove'
  | 'permissionReject';

type AllowedEventPayloads = {
  agentMessageChunk: AgentMessageChunkPayload;
  agentMessageDone: AgentMessageDonePayload;
  sessionRequestPermission: SessionRequestPermissionPayload;
  sessionForked: SessionForkedPayload;
};

type AllowedEvent = keyof AllowedEventPayloads;

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: AllowedChannel, ...args: unknown[]) => Promise<unknown>;
      on: <E extends AllowedEvent>(
        event: E,
        callback: (payload: AllowedEventPayloads[E]) => void,
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