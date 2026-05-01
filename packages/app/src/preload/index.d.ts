import type { AllowedMainExposeEvents, AgentRuntimeIPC } from "../shared/events-ipc.js";

type InvokeArgs<C extends keyof AgentRuntimeIPC> = Parameters<AgentRuntimeIPC[C]>;

interface ElectronAPI {
  invoke<C extends keyof AgentRuntimeIPC>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>>;
  on<E extends keyof AllowedMainExposeEvents>(
    event: E,
    callback: (data: AllowedMainExposeEvents[E]) => void,
  ): () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    api: unknown;
  }
}
