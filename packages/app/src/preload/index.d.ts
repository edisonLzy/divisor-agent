import type { IpcEventMap } from "../shared/message-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";

type AgentIPC = AgentModelsIPC & AgentSessionIPC;

type InvokeArgs<C extends keyof AgentIPC> =
  Parameters<AgentIPC[C]> extends [] ? [] : Parameters<AgentIPC[C]>;

interface ElectronAPI {
  invoke<C extends keyof AgentIPC>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<AgentIPC[C]>>>;
  on<E extends keyof IpcEventMap>(event: E, callback: (data: IpcEventMap[E]) => void): () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
  }
}
