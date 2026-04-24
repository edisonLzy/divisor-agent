import { contextBridge, ipcRenderer } from 'electron';
import type { IpcInvokeMap, IpcEventMap } from '../shared/ipc-types.js';

// These arrays are verified at compile-time to contain exactly the keys of
// IpcInvokeMap / IpcEventMap via `satisfies`. Adding or removing a channel
// from the shared types without updating these lists is a compile error.
const ALLOWED_CHANNELS = [
  'setModel',
  'cycleModel',
  'getAvailableModels',
  'sessionPrompt',
  'permissionApprove',
  'permissionReject',
] as const satisfies readonly (keyof IpcInvokeMap)[];

const ALLOWED_EVENTS = [
  'agentMessageChunk',
  'agentMessageDone',
  'sessionRequestPermission',
  'sessionForked',
] as const satisfies readonly (keyof IpcEventMap)[];

type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];
type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: AllowedChannel, ...args: unknown[]) => {
    if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (event: AllowedEvent, callback: (...args: unknown[]) => void) => {
    if (!(ALLOWED_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`IPC event not allowed: ${event}`);
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(event, subscription);
    return () => ipcRenderer.removeListener(event, subscription);
  },
});
