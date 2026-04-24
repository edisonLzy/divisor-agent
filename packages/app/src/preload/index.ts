import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_CHANNELS = [
  'setModel',
  'cycleModel',
  'getAvailableModels',
  'sessionPrompt',
  'permissionApprove',
  'permissionReject',
] as const;

const ALLOWED_EVENTS = [
  'agentMessageChunk',
  'agentMessageDone',
  'sessionRequestPermission',
  'sessionForked',
] as const;

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
    const subscription = (_e: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(event, subscription);
    return () => ipcRenderer.removeListener(event, subscription);
  },
});
