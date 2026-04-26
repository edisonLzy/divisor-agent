import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";

type AgentIPC = AgentModelsIPC & AgentSessionIPC;

interface ElectronAPI {
  invoke<C extends keyof AgentIPC>(
    channel: C,
    ...args: Parameters<AgentIPC[C]>
  ): Promise<ReturnType<AgentIPC[C]>>;
  on(
    event: "agentMessageChunk",
    callback: (data: {
      type: "text_delta" | "thinking_delta";
      delta: string;
      chunkIndex: number;
      sessionId: string;
    }) => void,
  ): () => void;
  on(event: "agentMessageDone", callback: (data: { sessionId: string }) => void): () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
  }
}

export type { AgentIPC };
