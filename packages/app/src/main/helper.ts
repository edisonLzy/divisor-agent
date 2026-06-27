import { ipcMain } from "electron";

export function createTypedIpcMain<AgentIPC extends Record<string, any>>() {
  return {
    ...ipcMain,
    handle<C extends keyof AgentIPC = keyof AgentIPC>(channel: C, listener: AgentIPC[C]) {
      ipcMain.handle(channel as unknown as string, (_, ...params) => {
        return (listener as any)(...params);
      });
    },
  };
}
